import os
import sqlite3
import hashlib

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'database.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt."""
    salt = "morondartva_salt_12983"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

def initialize_database():
    """Create tables if they don't exist and seed default categories/admin."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")

    # 1. Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        fullname TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        subscription_status TEXT DEFAULT 'free',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Categories table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL
    );
    """)

    # 3. Products table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        category_id INTEGER,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
    );
    """)

    # 4. Videos table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        category_id INTEGER,
        video_url TEXT NOT NULL,
        is_exclusive INTEGER DEFAULT 0,
        price REAL DEFAULT 0.0,
        thumbnail_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
    );
    """)

    # 5. Favorites table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id, item_id, item_type)
    );
    """)

    # 6. Orders table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        total_amount REAL NOT NULL,
        delivery_fee REAL DEFAULT 0,
        delivery_zone TEXT DEFAULT 'city',
        latitude REAL,
        longitude REAL,
        status TEXT DEFAULT 'pending',
        delivery_status TEXT DEFAULT 'pending',
        shipping_address TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
    """)

    # 7. Order Items table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
    );
    """)

    # 8. Payments table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        transaction_id TEXT UNIQUE,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
    );
    """)

    # 9. Purchased Videos table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS purchased_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        video_id INTEGER NOT NULL,
        purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE,
        UNIQUE(user_id, video_id)
    );
    """)

    # 10. Events table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        event_date TEXT NOT NULL,
        location TEXT,
        price REAL NOT NULL DEFAULT 0,
        total_tickets INTEGER NOT NULL DEFAULT 100,
        available_tickets INTEGER NOT NULL DEFAULT 100,
        vip_price REAL DEFAULT 0,
        vip_tickets INTEGER DEFAULT 0,
        vip_available INTEGER DEFAULT 0,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 11. Tickets table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        total_price REAL NOT NULL,
        ticket_type TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'confirmed',
        qr_token TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
    """)

    # Performance optimization indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_category_id ON videos(category_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_purchased_videos_user_id ON purchased_videos(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);")

    conn.commit()

    # Migrations for existing databases
    try:
        cursor.execute("ALTER TABLE events ADD COLUMN vip_price REAL DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE events ADD COLUMN vip_tickets INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE events ADD COLUMN vip_available INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE tickets ADD COLUMN ticket_type TEXT DEFAULT 'normal'")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE payments ADD COLUMN ticket_id INTEGER")
    except sqlite3.OperationalError:
        pass
    conn.commit()

    # Seed categories
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

    # Seed Admin User
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
        
    # Seed some dummy products if empty (for initial UX)
    cursor.execute("SELECT COUNT(*) FROM products")
    if cursor.fetchone()[0] == 0:
        # Get category IDs
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

    # Seed some dummy videos if empty
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

    # Seed sample events if empty
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
