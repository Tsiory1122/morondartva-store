import os
import hashlib
from db import get_db_connection, DB_TYPE  # re-exported for routes.py, auth.py

def hash_password(password: str) -> str:
    salt = "morondartva_salt_12983"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

def initialize_database():
    conn = get_db_connection()
    cursor = conn.cursor()

    if DB_TYPE != 'postgresql':
        cursor.execute("PRAGMA foreign_keys = ON;")

    pk_type = 'SERIAL PRIMARY KEY' if DB_TYPE == 'postgresql' else 'INTEGER PRIMARY KEY AUTOINCREMENT'
    real_type = 'DOUBLE PRECISION' if DB_TYPE == 'postgresql' else 'REAL'
    text_type = 'TEXT'
    ts_default = 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS users (
        id {pk_type},
        email {text_type} UNIQUE NOT NULL,
        password_hash {text_type} NOT NULL,
        fullname {text_type} NOT NULL,
        role {text_type} DEFAULT 'user',
        subscription_status {text_type} DEFAULT 'free',
        created_at {ts_default}
    );
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS categories (
        id {pk_type},
        name {text_type} NOT NULL,
        type {text_type} NOT NULL
    );
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS products (
        id {pk_type},
        name {text_type} NOT NULL,
        description {text_type},
        price {real_type} NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        category_id INTEGER,
        image_url {text_type},
        created_at {ts_default},
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
    );
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS videos (
        id {pk_type},
        title {text_type} NOT NULL,
        description {text_type},
        category_id INTEGER,
        video_url {text_type} NOT NULL,
        is_exclusive INTEGER DEFAULT 0,
        price {real_type} DEFAULT 0.0,
        thumbnail_url {text_type},
        created_at {ts_default},
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
    );
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS favorites (
        id {pk_type},
        user_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        item_type {text_type} NOT NULL,
        created_at {ts_default},
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id, item_id, item_type)
    );
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS orders (
        id {pk_type},
        user_id INTEGER NOT NULL,
        total_amount {real_type} NOT NULL,
        delivery_fee {real_type} DEFAULT 0,
        delivery_zone {text_type} DEFAULT 'city',
        latitude {real_type},
        longitude {real_type},
        status {text_type} DEFAULT 'pending_validation',
        delivery_status {text_type} DEFAULT 'pending',
        shipping_address {text_type} NOT NULL,
        phone_number {text_type} NOT NULL,
        payment_method {text_type} NOT NULL,
        created_at {ts_default},
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS order_items (
        id {pk_type},
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        price {real_type} NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
    );
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS payments (
        id {pk_type},
        order_id INTEGER,
        ticket_id INTEGER,
        user_id INTEGER NOT NULL,
        amount {real_type} NOT NULL,
        payment_method {text_type} NOT NULL,
        transaction_id {text_type} UNIQUE,
        status {text_type} DEFAULT 'pending',
        created_at {ts_default},
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL,
        FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE SET NULL
    );
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS purchased_videos (
        id {pk_type},
        user_id INTEGER NOT NULL,
        video_id INTEGER NOT NULL,
        purchase_date {ts_default},
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE,
        UNIQUE(user_id, video_id)
    );
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS events (
        id {pk_type},
        title {text_type} NOT NULL,
        description {text_type},
        event_date {text_type} NOT NULL,
        location {text_type},
        price {real_type} NOT NULL DEFAULT 0,
        total_tickets INTEGER NOT NULL DEFAULT 100,
        available_tickets INTEGER NOT NULL DEFAULT 100,
        vip_price {real_type} DEFAULT 0,
        vip_tickets INTEGER DEFAULT 0,
        vip_available INTEGER DEFAULT 0,
        image_url {text_type},
        created_at {ts_default}
    );
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS tickets (
        id {pk_type},
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        total_price {real_type} NOT NULL,
        ticket_type {text_type} DEFAULT 'normal',
        status {text_type} DEFAULT 'pending_validation',
        qr_token {text_type} UNIQUE,
        created_at {ts_default},
        FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_category_id ON videos(category_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_payments_ticket_id ON payments(ticket_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_purchased_videos_user_id ON purchased_videos(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);")

    conn.commit()

    try:
        cursor.execute("ALTER TABLE events ADD COLUMN vip_price REAL DEFAULT 0")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE events ADD COLUMN vip_tickets INTEGER DEFAULT 0")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE events ADD COLUMN vip_available INTEGER DEFAULT 0")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE tickets ADD COLUMN ticket_type TEXT DEFAULT 'normal'")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE payments ADD COLUMN ticket_id INTEGER")
    except Exception:
        pass
    try:
        cursor.execute("UPDATE orders SET status = 'pending_validation' WHERE status = 'pending'")
    except Exception:
        pass
    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM categories")
    if cursor.fetchone()[0] == 0:
        categories = [
            ("Vêtements", "product"),
            ("Accessoires", "product"),
            ("Éditions Limitées", "product"),
            ("Boisson", "product"),
            ("Autres", "product"),
            ("Films", "video"),
            ("Shorts", "video"),
            ("Clips", "video"),
            ("Channels", "video")
        ]
        cursor.executemany("INSERT INTO categories (name, type) VALUES (?, ?)", categories)
        conn.commit()

    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
    if cursor.fetchone()[0] == 0:
        admin_email = "admin@morondartva.com"
        admin_pass = hash_password("admin")
        cursor.execute(
            "INSERT INTO users (email, password_hash, fullname, role, subscription_status) VALUES (?, ?, ?, ?, ?)",
            (admin_email, admin_pass, "Morondartva Admin", "admin", "premium")
        )
        scanner_email = "scanner@morondartva.com"
        scanner_pass = hash_password("scanner")
        cursor.execute(
            "INSERT INTO users (email, password_hash, fullname, role, subscription_status) VALUES (?, ?, ?, ?, ?)",
            (scanner_email, scanner_pass, "Scanner Officiel", "scanner", "premium")
        )
        conn.commit()

    cursor.execute("SELECT COUNT(*) FROM products")
    if cursor.fetchone()[0] == 0:
        cursor.execute("SELECT id, name FROM categories WHERE type='product'")
        cat_map = {row['name']: row['id'] for row in cursor.fetchall()}
        products = [
            ("T-shirt Morondartva Noir", "T-shirt 100% coton bio avec logo officiel en impression haute définition.", 25000.0, 50, cat_map["Vêtements"], "/client/assets/product_tshirt.jpg"),
            ("Casquette Broderie Premium", "Casquette style baseball en coton brossé, broderie blanche 3D.", 15000.0, 30, cat_map["Accessoires"], "/client/assets/product_cap.jpg"),
            ("Hoodie Oversized 'Art & Vision'", "Sweat à capuche confort, sérigraphie originale sur le dos.", 45000.0, 20, cat_map["Vêtements"], "/client/assets/product_hoodie.jpg"),
            ("Mug Céramique Morondartva", "Mug noir mat résistant au lave-vaisselle et micro-ondes.", 8000.0, 100, cat_map["Accessoires"], "/client/assets/product_mug.jpg")
        ]
        cursor.executemany("INSERT INTO products (name, description, price, stock, category_id, image_url) VALUES (?, ?, ?, ?, ?, ?)", products)
        conn.commit()

    cursor.execute("SELECT COUNT(*) FROM videos")
    if cursor.fetchone()[0] == 0:
        cursor.execute("SELECT id, name FROM categories WHERE type='video'")
        cat_map = {row['name']: row['id'] for row in cursor.fetchall()}
        videos = [
            ("L'Ombre du Baobab", "Un court-métrage dramatique capturant la beauté et les mystères du grand Ouest.", cat_map["Films"], "https://www.w3schools.com/html/mov_bbb.mp4", 0, 0.0, "/client/assets/thumb_baobab.jpg"),
            ("Morondava Beats", "Clip musical expérimental mêlant sonorités traditionnelles et rythmes urbains.", cat_map["Clips"], "https://www.w3schools.com/html/movie.mp4", 0, 0.0, "/client/assets/thumb_beats.jpg"),
            ("Dans les Coulisses de Morondartva", "Interview exclusive et images de tournage de nos dernières productions. Réservé aux membres Premium.", cat_map["Channels"], "https://www.w3schools.com/html/mov_bbb.mp4", 1, 0.0, "/client/assets/thumb_behind.jpg")
        ]
        cursor.executemany("INSERT INTO videos (title, description, category_id, video_url, is_exclusive, price, thumbnail_url) VALUES (?, ?, ?, ?, ?, ?, ?)", videos)
        conn.commit()

    cursor.execute("SELECT COUNT(*) FROM events")
    if cursor.fetchone()[0] == 0:
        events = [
            ("Soirée de Lancement Label", "Venez découvrir les nouvelles productions du label Morondartva. Concert, DJ set et projections.", "2026-08-15 20:00", "Salle Polyvalente, Morondava", 15000.0, 200, 200, 25000.0, 50, 50, ""),
            ("Masterclass Production", "Atelier animé par nos réalisateurs sur les techniques de production audiovisuelle.", "2026-09-10 14:00", "Espace Créatif, Morondava", 5000.0, 50, 50, 10000.0, 20, 20, ""),
        ]
        cursor.executemany(
            "INSERT INTO events (title, description, event_date, location, price, total_tickets, available_tickets, vip_price, vip_tickets, vip_available, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            events
        )
        conn.commit()

    conn.close()

if __name__ == '__main__':
    initialize_database()
    print("Database initialized successfully.")
