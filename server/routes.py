import re
import json
import urllib.parse
import base64
import os
import time
import uuid
from database import get_db_connection, hash_password, verify_password
from auth import create_session, destroy_session, get_current_user_from_request
import payment

# Directory paths for saving uploads
UPLOAD_PRODUCTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', 'products')
UPLOAD_VIDEOS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', 'videos')
UPLOAD_EVENTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', 'events')

# Ensure directories exist
os.makedirs(UPLOAD_PRODUCTS_DIR, exist_ok=True)
os.makedirs(UPLOAD_VIDEOS_DIR, exist_ok=True)
os.makedirs(UPLOAD_EVENTS_DIR, exist_ok=True)

# Helper: Send JSON Response
def send_json(handler, data, status=200, cookies=None):
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    if cookies:
        for k, v in cookies.items():
            handler.send_header('Set-Cookie', f"{k}={v}; Path=/; HttpOnly; SameSite=Lax")
            
    handler.end_headers()
    handler.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

# Helper: Send JSON Error
def send_error(handler, message, status=400):
    send_json(handler, {"error": message}, status)

# Helper: Read JSON Body
def read_json_body(handler):
    try:
        content_length = int(handler.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        body = handler.rfile.read(content_length)
        return json.loads(body.decode('utf-8'))
    except Exception as e:
        print(f"Error reading JSON body: {e}")
        return {}

# Helper: Save base64 file to disk
def save_base64_file(base64_str, folder, default_ext="png"):
    try:
        if ',' in base64_str:
            header, base64_str = base64_str.split(',', 1)
        
        file_data = base64.b64decode(base64_str)
        filename = f"file_{int(time.time())}_{os.urandom(4).hex()}.{default_ext}"
        filepath = os.path.join(folder, filename)
        
        with open(filepath, 'wb') as f:
            f.write(file_data)
            
        # Return path relative to project root
        rel_folder = os.path.basename(folder)
        return f"/uploads/{rel_folder}/{filename}"
    except Exception as e:
        print(f"Error saving base64 file: {e}")
        return None

# API HANDLERS

def route_options(handler):
    handler.send_response(204)
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    handler.end_headers()

# --- AUTH ROUTES ---

def handle_register(handler):
    body = read_json_body(handler)
    email = body.get('email', '').strip().lower()
    password = body.get('password', '')
    fullname = body.get('fullname', '').strip()
    
    if not email or not password or not fullname:
        return send_error(handler, "Veuillez remplir tous les champs.")
        
    import re
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return send_error(handler, "Format d'adresse email invalide.")
        
    if len(password) < 6:
        return send_error(handler, "Le mot de passe doit contenir au moins 6 caractères.")
        
    conn = get_db_connection()
    try:
        # Check if user exists
        exists = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if exists:
            return send_error(handler, "Cet email est déjà utilisé.")
            
        hashed = hash_password(password)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (email, password_hash, fullname) VALUES (?, ?, ?)",
            (email, hashed, fullname)
        )
        conn.commit()
        send_json(handler, {"message": "Inscription réussie !"}, 201)
    except Exception as e:
        send_error(handler, f"Erreur lors de l'inscription: {str(e)}", 500)
    finally:
        conn.close()

def handle_login(handler):
    body = read_json_body(handler)
    email = body.get('email', '').strip().lower()
    password = body.get('password', '')
    
    if not email or not password:
        return send_error(handler, "Veuillez fournir un email et un mot de passe.")
        
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user or not verify_password(password, user['password_hash']):
            return send_error(handler, "Identifiants incorrects.", 401)
            
        token = create_session(user['id'], user['email'], user['role'])
        
        # Prepare response profile info
        profile = {
            "id": user['id'],
            "email": user['email'],
            "fullname": user['fullname'],
            "role": user['role'],
            "subscription_status": user['subscription_status']
        }
        
        send_json(handler, {
            "message": "Connexion réussie !",
            "token": token,
            "user": profile
        }, cookies={"session_id": token})
    except Exception as e:
        send_error(handler, f"Erreur de connexion: {str(e)}", 500)
    finally:
        conn.close()

def handle_logout(handler):
    # Extract token
    token = None
    auth_header = handler.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
    if not token:
        cookie_header = handler.headers.get('Cookie')
        if cookie_header:
            for item in cookie_header.split(';'):
                if '=' in item:
                    k, v = item.split('=', 1)
                    if k.strip() == 'session_id':
                        token = v.strip()
                        break
                        
    if token:
        destroy_session(token)
        
    # Clear client cookie
    send_json(handler, {"message": "Déconnexion réussie !"}, cookies={"session_id": "deleted; Max-Age=0"})

def handle_get_profile(handler):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)
        
    conn = get_db_connection()
    try:
        # Get orders
        orders_db = conn.execute(
            "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
            (user['id'],)
        ).fetchall()
        orders = [dict(o) for o in orders_db]
        
        # Get purchased videos
        purchased_db = conn.execute(
            "SELECT v.* FROM videos v JOIN purchased_videos pv ON v.id = pv.video_id WHERE pv.user_id = ?",
            (user['id'],)
        ).fetchall()
        purchased_videos = [dict(pv) for pv in purchased_db]
        
        # Get favorites
        fav_db = conn.execute(
            "SELECT item_id, item_type FROM favorites WHERE user_id = ?",
            (user['id'],)
        ).fetchall()
        favorites = [dict(f) for f in fav_db]
        
        profile = {
            "id": user['id'],
            "email": user['email'],
            "fullname": user['fullname'],
            "role": user['role'],
            "subscription_status": user['subscription_status'],
            "orders": orders,
            "purchased_videos": purchased_videos,
            "favorites": favorites
        }
        send_json(handler, profile)
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_update_profile(handler):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)
        
    body = read_json_body(handler)
    fullname = body.get('fullname', '').strip()
    email = body.get('email', '').strip().lower()
    new_password = body.get('password', '')
    
    if not fullname or not email:
        return send_error(handler, "Nom et Email requis.")
        
    conn = get_db_connection()
    try:
        # Check if email taken by someone else
        existing = conn.execute("SELECT id FROM users WHERE email = ? AND id != ?", (email, user['id'])).fetchone()
        if existing:
            return send_error(handler, "Cet email est déjà utilisé par un autre compte.")
            
        if new_password:
            hashed = hash_password(new_password)
            conn.execute(
                "UPDATE users SET fullname = ?, email = ?, password_hash = ? WHERE id = ?",
                (fullname, email, hashed, user['id'])
            )
        else:
            conn.execute(
                "UPDATE users SET fullname = ?, email = ? WHERE id = ?",
                (fullname, email, user['id'])
            )
        conn.commit()
        
        updated_user = conn.execute(
            "SELECT id, email, fullname, role, subscription_status FROM users WHERE id = ?",
            (user['id'],)
        ).fetchone()
        
        send_json(handler, {"message": "Profil mis à jour !", "user": dict(updated_user)})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_upgrade_premium(handler):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)
    body = read_json_body(handler)
    payment_method = body.get('payment_method', '').strip().lower()
    phone_number = body.get('phone_number', '').strip()
    if not payment_method or not phone_number:
        return send_error(handler, "Méthode de paiement et numéro requis.")
    amount = 30000.0
    conn = get_db_connection()
    try:
        pay_res = None
        if payment_method == 'mvola':
            pay_res = payment.initiate_mvola_payment(amount, phone_number, 0)
        elif payment_method == 'orange_money':
            pay_res = payment.initiate_orange_money_payment(amount, phone_number, 0)
        elif payment_method == 'airtel_money':
            pay_res = payment.initiate_airtel_money_payment(amount, phone_number, 0)
        else:
            pay_res = payment.initiate_card_payment(amount, "tok_simulated", 0)
        if not pay_res or not pay_res.get('success'):
            return send_error(handler, pay_res.get('error', "Échec de l'initialisation du paiement."))
        ussd_code = pay_res.get('ussd_code')
        if ussd_code:
            conn.execute(
                "INSERT INTO payments (user_id, amount, payment_method, transaction_id, status) VALUES (?, ?, ?, ?, ?)",
                (user['id'], amount, payment_method, pay_res.get('transaction_id'), 'pending')
            )
            conn.commit()
            send_json(handler, {
                "message": "Code USSD généré. Effectuez le paiement sur votre téléphone pour devenir Premium.",
                "ussd_code": ussd_code,
                "instruction": pay_res.get('instruction', f"Composez {ussd_code} sur votre téléphone."),
                "transaction_id": pay_res.get('transaction_id'),
                "status": "pending_payment"
            })
        else:
            conn.execute("UPDATE users SET subscription_status = 'premium' WHERE id = ?", (user['id'],))
            conn.execute(
                "INSERT INTO payments (user_id, amount, payment_method, transaction_id, status) VALUES (?, ?, ?, ?, ?)",
                (user['id'], amount, payment_method, pay_res.get('transaction_id'), 'completed')
            )
            conn.commit()
            send_json(handler, {
                "message": "Félicitations ! Vous êtes maintenant un membre Premium.",
                "subscription_status": "premium"
            })
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

# --- CATEGORY ROUTES ---

def handle_get_categories(handler):
    conn = get_db_connection()
    try:
        categories = conn.execute("SELECT * FROM categories ORDER BY CASE WHEN name = 'Autres' THEN 1 ELSE 0 END, id ASC").fetchall()
        send_json(handler, [dict(c) for c in categories])
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

# --- PRODUCT ROUTES ---

def handle_get_products(handler):
    parsed_url = urllib.parse.urlparse(handler.path)
    query_params = urllib.parse.parse_qs(parsed_url.query)
    
    category_id = query_params.get('category_id', [None])[0]
    search = query_params.get('search', [None])[0]
    page = int(query_params.get('page', [1])[0])
    limit = int(query_params.get('limit', [12])[0])
    offset = (page - 1) * limit
    
    conn = get_db_connection()
    try:
        count_sql = "SELECT COUNT(*) FROM products p WHERE 1=1"
        sql = "SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1"
        params = []
        
        if category_id:
            sql += " AND p.category_id = ?"
            count_sql += " AND p.category_id = ?"
            params.append(category_id)
        if search:
            sql += " AND (p.name LIKE ? OR p.description LIKE ?)"
            count_sql += " AND (p.name LIKE ? OR p.description LIKE ?)"
            params.append(f"%{search}%")
            params.append(f"%{search}%")
            
        total = conn.execute(count_sql, params).fetchone()[0]
        sql += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?"
        products = conn.execute(sql, params + [limit, offset]).fetchall()
        send_json(handler, {"data": [dict(p) for p in products], "total": total, "page": page, "total_pages": max(1, -(-total // limit))})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_get_product_detail(handler, product_id):
    conn = get_db_connection()
    try:
        product = conn.execute(
            "SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?",
            (product_id,)
        ).fetchone()
        if not product:
            return send_error(handler, "Produit introuvable.", 404)
        send_json(handler, dict(product))
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_create_product(handler):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit. Réservé aux administrateurs.", 403)
        
    body = read_json_body(handler)
    name = body.get('name', '').strip()
    description = body.get('description', '').strip()
    price = float(body.get('price', 0))
    stock = int(body.get('stock', 0))
    category_id = body.get('category_id')
    image_url = body.get('image_url', '').strip()
    image_base64 = body.get('image_base64')
    
    if not name or price <= 0:
        return send_error(handler, "Informations de produit invalides.")
        
    # Save base64 image if uploaded
    if image_base64:
        # Determine extension
        ext = "jpg"
        if "data:image/png" in image_base64:
            ext = "png"
        elif "data:image/webp" in image_base64:
            ext = "webp"
        saved_path = save_base64_file(image_base64, UPLOAD_PRODUCTS_DIR, ext)
        if saved_path:
            image_url = saved_path
            
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO products (name, description, price, stock, category_id, image_url) VALUES (?, ?, ?, ?, ?, ?)",
            (name, description, price, stock, category_id, image_url)
        )
        conn.commit()
        send_json(handler, {"message": "Produit ajouté !", "id": cursor.lastrowid}, 201)
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_update_product(handler, product_id):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
        
    body = read_json_body(handler)
    name = body.get('name', '').strip()
    description = body.get('description', '').strip()
    price = float(body.get('price', 0))
    stock = int(body.get('stock', 0))
    category_id = body.get('category_id')
    image_url = body.get('image_url', '').strip()
    image_base64 = body.get('image_base64')
    
    if not name or price <= 0:
        return send_error(handler, "Informations de produit invalides.")
        
    if image_base64:
        ext = "jpg"
        if "data:image/png" in image_base64:
            ext = "png"
        saved_path = save_base64_file(image_base64, UPLOAD_PRODUCTS_DIR, ext)
        if saved_path:
            image_url = saved_path
            
    conn = get_db_connection()
    try:
        if image_url:
            conn.execute(
                "UPDATE products SET name = ?, description = ?, price = ?, stock = ?, category_id = ?, image_url = ? WHERE id = ?",
                (name, description, price, stock, category_id, image_url, product_id)
            )
        else:
            conn.execute(
                "UPDATE products SET name = ?, description = ?, price = ?, stock = ?, category_id = ? WHERE id = ?",
                (name, description, price, stock, category_id, product_id)
            )
        conn.commit()
        send_json(handler, {"message": "Produit mis à jour !"})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_delete_product(handler, product_id):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
        
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
        conn.commit()
        send_json(handler, {"message": "Produit supprimé !"})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

# --- VIDEO ROUTES ---

def handle_get_videos(handler):
    user = get_current_user_from_request(handler)
    
    parsed_url = urllib.parse.urlparse(handler.path)
    query_params = urllib.parse.parse_qs(parsed_url.query)
    
    category_id = query_params.get('category_id', [None])[0]
    
    conn = get_db_connection()
    try:
        sql = "SELECT v.*, c.name as category_name FROM videos v LEFT JOIN categories c ON v.category_id = c.id WHERE 1=1"
        params = []
        
        if category_id:
            sql += " AND v.category_id = ?"
            params.append(category_id)
            
        sql += " ORDER BY v.created_at DESC"
        
        videos_db = conn.execute(sql, params).fetchall()
        videos = []
        
        # Check permissions for locked videos
        user_id = user['id'] if user else None
        is_premium = (user and user['subscription_status'] == 'premium') or (user and user['role'] == 'admin')
        
        # Get list of individually purchased videos for this user
        purchased_ids = set()
        if user_id:
            purchased_rows = conn.execute("SELECT video_id FROM purchased_videos WHERE user_id = ?", (user_id,)).fetchall()
            purchased_ids = {r['video_id'] for r in purchased_rows}
            
        for row in videos_db:
            video = dict(row)
            # Add accessible flag
            if not video['is_exclusive']:
                video['is_accessible'] = True
            elif is_premium:
                video['is_accessible'] = True
            elif video['id'] in purchased_ids:
                video['is_accessible'] = True
            else:
                video['is_accessible'] = False
                
            # If not accessible, hide the exact video URL to prevent scraping, send placeholder or empty
            if not video['is_accessible']:
                video['video_url'] = ""  # Hide the actual URL
                
            videos.append(video)
            
        send_json(handler, videos)
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_get_video_detail(handler, video_id):
    user = get_current_user_from_request(handler)
    
    conn = get_db_connection()
    try:
        video = conn.execute(
            "SELECT v.*, c.name as category_name FROM videos v LEFT JOIN categories c ON v.category_id = c.id WHERE v.id = ?",
            (video_id,)
        ).fetchone()
        
        if not video:
            return send_error(handler, "Vidéo introuvable.", 404)
            
        video_dict = dict(video)
        
        # Check access
        is_premium = (user and user['subscription_status'] == 'premium') or (user and user['role'] == 'admin')
        is_purchased = False
        if user:
            purchased = conn.execute(
                "SELECT id FROM purchased_videos WHERE user_id = ? AND video_id = ?",
                (user['id'], video_id)
            ).fetchone()
            is_purchased = bool(purchased)
            
        if video_dict['is_exclusive'] and not is_premium and not is_purchased:
            video_dict['is_accessible'] = False
            video_dict['video_url'] = ""  # Redact
        else:
            video_dict['is_accessible'] = True
            
        send_json(handler, video_dict)
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_create_video(handler):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
        
    body = read_json_body(handler)
    title = body.get('title', '').strip()
    description = body.get('description', '').strip()
    category_id = body.get('category_id')
    video_url = body.get('video_url', '').strip()
    is_exclusive = int(body.get('is_exclusive', 0))
    price = float(body.get('price', 0.0))
    thumbnail_url = body.get('thumbnail_url', '').strip()
    thumbnail_base64 = body.get('thumbnail_base64')
    
    if not title or not video_url:
        return send_error(handler, "Le titre et l'URL de la vidéo sont requis.")
        
    if thumbnail_base64:
        saved_path = save_base64_file(thumbnail_base64, UPLOAD_PRODUCTS_DIR, "jpg") # Store in products directory or generic uploads
        if saved_path:
            thumbnail_url = saved_path
            
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO videos (title, description, category_id, video_url, is_exclusive, price, thumbnail_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (title, description, category_id, video_url, is_exclusive, price, thumbnail_url)
        )
        conn.commit()
        send_json(handler, {"message": "Vidéo ajoutée !", "id": cursor.lastrowid}, 201)
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_update_video(handler, video_id):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
        
    body = read_json_body(handler)
    title = body.get('title', '').strip()
    description = body.get('description', '').strip()
    category_id = body.get('category_id')
    video_url = body.get('video_url', '').strip()
    is_exclusive = int(body.get('is_exclusive', 0))
    price = float(body.get('price', 0.0))
    thumbnail_url = body.get('thumbnail_url', '').strip()
    thumbnail_base64 = body.get('thumbnail_base64')
    
    if not title or not video_url:
        return send_error(handler, "Le titre et l'URL de la vidéo sont requis.")
        
    if thumbnail_base64:
        saved_path = save_base64_file(thumbnail_base64, UPLOAD_PRODUCTS_DIR, "jpg")
        if saved_path:
            thumbnail_url = saved_path
            
    conn = get_db_connection()
    try:
        if thumbnail_url:
            conn.execute(
                "UPDATE videos SET title = ?, description = ?, category_id = ?, video_url = ?, is_exclusive = ?, price = ?, thumbnail_url = ? WHERE id = ?",
                (title, description, category_id, video_url, is_exclusive, price, thumbnail_url, video_id)
            )
        else:
            conn.execute(
                "UPDATE videos SET title = ?, description = ?, category_id = ?, video_url = ?, is_exclusive = ?, price = ? WHERE id = ?",
                (title, description, category_id, video_url, is_exclusive, price, video_id)
            )
        conn.commit()
        send_json(handler, {"message": "Vidéo mise à jour !"})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_delete_video(handler, video_id):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
        
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM videos WHERE id = ?", (video_id,))
        conn.commit()
        send_json(handler, {"message": "Vidéo supprimée !"})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_purchase_video(handler, video_id):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)
        
    body = read_json_body(handler)
    payment_method = body.get('payment_method', '').strip().lower()
    phone_number = body.get('phone_number', '').strip()
    
    if not payment_method:
        return send_error(handler, "Méthode de paiement requise.")
        
    conn = get_db_connection()
    try:
        # Check if video exists
        video = conn.execute("SELECT id, price, title, is_exclusive FROM videos WHERE id = ?", (video_id,)).fetchone()
        if not video:
            return send_error(handler, "Vidéo introuvable.", 404)
            
        if not video['is_exclusive'] or video['price'] <= 0:
            return send_error(handler, "Cette vidéo est gratuite ou nécessite un abonnement global.")
            
        # Check if already purchased
        already = conn.execute(
            "SELECT id FROM purchased_videos WHERE user_id = ? AND video_id = ?",
            (user['id'], video_id)
        ).fetchone()
        if already:
            return send_json(handler, {"message": "Vidéo déjà achetée !", "video_id": video_id})
            
        # Simulate payment gateway
        amount = video['price']
        pay_res = None
        if payment_method == 'mvola':
            pay_res = payment.initiate_mvola_payment(amount, phone_number, f"V-{video_id}")
        elif payment_method == 'orange_money':
            pay_res = payment.initiate_orange_money_payment(amount, phone_number, f"V-{video_id}")
        elif payment_method == 'airtel_money':
            pay_res = payment.initiate_airtel_money_payment(amount, phone_number, f"V-{video_id}")
        elif payment_method == 'paypal':
            pay_res = payment.initiate_paypal_payment(amount / 4000.0, f"V-{video_id}") # Convert to USD roughly
        else:
            pay_res = payment.initiate_card_payment(amount, "tok_simulated", f"V-{video_id}")
            
        if pay_res and pay_res.get('success'):
            ussd_code = pay_res.get('ussd_code')
            if ussd_code:
                conn.execute(
                    "INSERT INTO payments (user_id, amount, payment_method, transaction_id, status) VALUES (?, ?, ?, ?, ?)",
                    (user['id'], amount, payment_method, pay_res.get('transaction_id'), 'pending')
                )
                conn.commit()
                send_json(handler, {
                    "message": pay_res.get('message', "Code USSD généré. Effectuez le paiement sur votre téléphone."),
                    "video_id": video_id,
                    "transaction_id": pay_res.get('transaction_id'),
                    "ussd_code": ussd_code,
                    "instruction": pay_res.get('instruction', f"Composez {ussd_code} sur votre téléphone."),
                    "status": "pending_payment"
                })
            else:
                conn.execute(
                    "INSERT INTO purchased_videos (user_id, video_id) VALUES (?, ?)",
                    (user['id'], video_id)
                )
                conn.execute(
                    "INSERT INTO payments (user_id, amount, payment_method, transaction_id, status) VALUES (?, ?, ?, ?, ?)",
                    (user['id'], amount, payment_method, pay_res.get('transaction_id'), 'completed')
                )
                conn.commit()
                send_json(handler, {
                    "message": f"Achat de la vidéo '{video['title']}' effectué avec succès !",
                    "video_id": video_id,
                    "transaction_id": pay_res.get('transaction_id')
                })
        else:
            send_error(handler, pay_res.get('error', "Échec de l'initialisation du paiement."))
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

# --- FAVORITES ROUTES ---

def handle_get_favorites(handler):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)
        
    conn = get_db_connection()
    try:
        favs = conn.execute("SELECT * FROM favorites WHERE user_id = ?", (user['id'],)).fetchall()
        send_json(handler, [dict(f) for f in favs])
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_toggle_favorite(handler):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)
        
    body = read_json_body(handler)
    item_id = body.get('item_id')
    item_type = body.get('item_type') # 'product' or 'video'
    
    if not item_id or item_type not in ('product', 'video'):
        return send_error(handler, "Champs item_id et item_type requis.")
        
    conn = get_db_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM favorites WHERE user_id = ? AND item_id = ? AND item_type = ?",
            (user['id'], item_id, item_type)
        ).fetchone()
        
        cursor = conn.cursor()
        if existing:
            cursor.execute("DELETE FROM favorites WHERE id = ?", (existing['id'],))
            status = "removed"
        else:
            cursor.execute(
                "INSERT INTO favorites (user_id, item_id, item_type) VALUES (?, ?, ?)",
                (user['id'], item_id, item_type)
            )
            status = "added"
        conn.commit()
        send_json(handler, {"message": f"Favori {status} !", "status": status})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

# --- ORDERS ROUTES ---

def handle_get_orders(handler):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)

    parsed_url = urllib.parse.urlparse(handler.path)
    query_params = urllib.parse.parse_qs(parsed_url.query)
    page = int(query_params.get('page', [1])[0])
    limit = int(query_params.get('limit', [10])[0])
    offset = (page - 1) * limit
        
    conn = get_db_connection()
    try:
        total = conn.execute("SELECT COUNT(*) FROM orders WHERE user_id = ?", (user['id'],)).fetchone()[0]
        orders_db = conn.execute(
            "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (user['id'], limit, offset)
        ).fetchall()
        orders = []
        for o in orders_db:
            o_dict = dict(o)
            items_db = conn.execute(
                "SELECT oi.*, p.name as product_name, p.image_url FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?",
                (o_dict['id'],)
            ).fetchall()
            o_dict['items'] = [dict(i) for i in items_db]
            orders.append(o_dict)
            
        send_json(handler, {"data": orders, "total": total, "page": page, "total_pages": max(1, -(-total // limit))})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_update_delivery_status(handler, order_id):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
    body = read_json_body(handler)
    delivery_status = body.get('delivery_status', '').strip()
    order_flow = ['pending', 'preparing', 'shipped', 'delivered']
    if delivery_status not in order_flow:
        return send_error(handler, f"Statut invalide. Valeurs: {', '.join(order_flow)}")
    conn = get_db_connection()
    try:
        current = conn.execute("SELECT delivery_status FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not current:
            return send_error(handler, "Commande introuvable.", 404)
        current_idx = order_flow.index(current['delivery_status'])
        new_idx = order_flow.index(delivery_status)
        if new_idx <= current_idx:
            return send_error(handler, f"Impossible de revenir en arrière. Statut actuel: {current['delivery_status']}")
        conn.execute("UPDATE orders SET delivery_status = ? WHERE id = ?", (delivery_status, order_id))
        conn.commit()
        send_json(handler, {"message": "Statut de livraison mis à jour !", "delivery_status": delivery_status})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_create_order(handler):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)
        
    body = read_json_body(handler)
    items = body.get('items', [])  # list of {product_id, quantity}
    shipping_address = body.get('shipping_address', '').strip()
    phone_number = body.get('phone_number', '').strip()
    payment_method = body.get('payment_method', '').strip().lower()
    delivery_zone = body.get('delivery_zone', 'city')
    delivery_fee = float(body.get('delivery_fee', 0))
    latitude = body.get('latitude')
    longitude = body.get('longitude')
    
    if not items:
        return send_error(handler, "Votre panier est vide.")
    if not shipping_address or not phone_number or not payment_method:
        return send_error(handler, "Informations de livraison et de paiement requises.")
        
    conn = get_db_connection()
    try:
        # 1. Calculate total and check/update stocks
        total_amount = 0.0
        validated_items = []
        
        for item in items:
            p_id = item.get('product_id')
            qty = int(item.get('quantity', 0))
            if qty <= 0:
                continue
                
            product = conn.execute("SELECT id, price, stock, name FROM products WHERE id = ?", (p_id,)).fetchone()
            if not product:
                return send_error(handler, f"Produit ID {p_id} introuvable.")
            if product['stock'] < qty:
                return send_error(handler, f"Stock insuffisant pour '{product['name']}'. Disponible: {product['stock']}.")
                
            item_total = product['price'] * qty
            total_amount += item_total
            validated_items.append({
                "product_id": p_id,
                "quantity": qty,
                "price": product['price'],
                "new_stock": product['stock'] - qty
            })
            
        if not validated_items:
            return send_error(handler, "Aucun article valide trouvé.")
            
        # Add delivery fee to total
        total_with_delivery = total_amount + delivery_fee
            
        # 2. Simulate Payment
        pay_res = None
        if payment_method == 'mvola':
            pay_res = payment.initiate_mvola_payment(total_with_delivery, phone_number, 0)
        elif payment_method == 'orange_money':
            pay_res = payment.initiate_orange_money_payment(total_with_delivery, phone_number, 0)
        elif payment_method == 'airtel_money':
            pay_res = payment.initiate_airtel_money_payment(total_with_delivery, phone_number, 0)
        elif payment_method == 'paypal':
            pay_res = payment.initiate_paypal_payment(total_with_delivery / 4000.0, 0)
        else:
            pay_res = payment.initiate_card_payment(total_with_delivery, "tok_simulated", 0)
            
        if not pay_res or not pay_res.get('success'):
            return send_error(handler, pay_res.get('error', "Échec de l'initialisation du paiement."))
            
        ussd_code = pay_res.get('ussd_code')
        order_status = 'pending' if ussd_code else 'paid'
        
        # 3. Create Order with delivery info
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO orders (user_id, total_amount, delivery_fee, delivery_zone, latitude, longitude, status, shipping_address, phone_number, payment_method)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user['id'], total_with_delivery, delivery_fee, delivery_zone, latitude, longitude, order_status, shipping_address, phone_number, payment_method)
        )
        order_id = cursor.lastrowid
        
        # 4. Save items & Update stock
        for v_item in validated_items:
            cursor.execute(
                "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
                (order_id, v_item['product_id'], v_item['quantity'], v_item['price'])
            )
            cursor.execute(
                "UPDATE products SET stock = ? WHERE id = ?",
                (v_item['new_stock'], v_item['product_id'])
            )
            
        # 5. Insert payment logs
        payment_status = 'pending' if ussd_code else 'completed'
        cursor.execute(
            "INSERT INTO payments (order_id, user_id, amount, payment_method, transaction_id, status) VALUES (?, ?, ?, ?, ?, ?)",
            (order_id, user['id'], total_with_delivery, payment_method, pay_res.get('transaction_id'), payment_status)
        )
        
        conn.commit()
        
        if ussd_code:
            send_json(handler, {
                "message": pay_res.get('message', "Code USSD généré. Effectuez le paiement sur votre téléphone."),
                "order_id": order_id,
                "transaction_id": pay_res.get('transaction_id'),
                "ussd_code": ussd_code,
                "instruction": pay_res.get('instruction', f"Composez {ussd_code} sur votre téléphone."),
                "status": "pending_payment"
            }, 201)
        else:
            send_json(handler, {
                "message": "Commande passée avec succès !",
                "order_id": order_id,
                "transaction_id": pay_res.get('transaction_id')
            }, 201)
        
    except Exception as e:
        conn.rollback()
        send_error(handler, f"Erreur lors de la commande: {str(e)}", 500)
    finally:
        conn.close()

# --- ADMIN ROUTES ---

def handle_admin_get_orders(handler):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
    parsed_url = urllib.parse.urlparse(handler.path)
    query_params = urllib.parse.parse_qs(parsed_url.query)
    page = int(query_params.get('page', [1])[0])
    limit = int(query_params.get('limit', [20])[0])
    offset = (page - 1) * limit
    conn = get_db_connection()
    try:
        total = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        orders_db = conn.execute(
            """SELECT o.*, u.fullname as user_name, u.email as user_email
               FROM orders o JOIN users u ON o.user_id = u.id
               ORDER BY o.created_at DESC LIMIT ? OFFSET ?""",
            (limit, offset)
        ).fetchall()
        send_json(handler, {"data": [dict(o) for o in orders_db], "total": total, "page": page, "total_pages": max(1, -(-total // limit))})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_admin_get_stats(handler):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
        
    conn = get_db_connection()
    try:
        # Total users
        total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        # Total sales
        total_sales = conn.execute("SELECT SUM(amount) FROM payments WHERE status = 'completed'").fetchone()[0] or 0.0
        # Total orders
        total_orders = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        # Total videos
        total_videos = conn.execute("SELECT COUNT(*) FROM videos").fetchone()[0]
        # Total products
        total_products = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        # Total events
        total_events = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        
        # Recent payments
        payments_db = conn.execute(
            "SELECT p.*, u.fullname as user_name, u.email as user_email FROM payments p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC LIMIT 10"
        ).fetchall()
        payments = [dict(p) for p in payments_db]
        
        # Recent orders
        orders_db = conn.execute(
            "SELECT o.*, u.fullname as user_name FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 10"
        ).fetchall()
        orders = [dict(o) for o in orders_db]
        
        # Most popular videos (by favorite count)
        popular_videos = conn.execute("""
            SELECT v.id, v.title, COUNT(f.id) as favorites_count 
            FROM videos v 
            LEFT JOIN favorites f ON v.id = f.item_id AND f.item_type = 'video'
            GROUP BY v.id 
            ORDER BY favorites_count DESC 
            LIMIT 5
        """).fetchall()
        videos_ranking = [dict(pv) for pv in popular_videos]

        # Most popular products (by sales quantity)
        popular_products = conn.execute("""
            SELECT p.id, p.name, SUM(oi.quantity) as sales_qty 
            FROM products p 
            LEFT JOIN order_items oi ON p.id = oi.product_id
            GROUP BY p.id 
            ORDER BY sales_qty DESC 
            LIMIT 5
        """).fetchall()
        products_ranking = [dict(pp) for pp in popular_products]
        
        stats = {
            "total_users": total_users,
            "total_sales": total_sales,
            "total_orders": total_orders,
            "total_videos": total_videos,
            "total_products": total_products,
            "total_events": total_events,
            "recent_payments": payments,
            "recent_orders": orders,
            "popular_videos": videos_ranking,
            "popular_products": products_ranking
        }
        send_json(handler, stats)
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_admin_get_users(handler):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
        
    conn = get_db_connection()
    try:
        users = conn.execute(
            "SELECT id, email, fullname, role, subscription_status, created_at FROM users ORDER BY created_at DESC"
        ).fetchall()
        send_json(handler, [dict(u) for u in users])
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_admin_update_user(handler, user_id):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
        
    body = read_json_body(handler)
    role = body.get('role')
    subscription_status = body.get('subscription_status')
    
    if not role or not subscription_status:
        return send_error(handler, "Role et statut d'abonnement requis.")
        
    conn = get_db_connection()
    try:
        conn.execute(
            "UPDATE users SET role = ?, subscription_status = ? WHERE id = ?",
            (role, subscription_status, user_id)
        )
        conn.commit()
        send_json(handler, {"message": "Utilisateur mis à jour !"})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_admin_delete_user(handler, user_id):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
        
    if int(user_id) == user['id']:
        return send_error(handler, "Vous ne pouvez pas supprimer votre propre compte.")
        
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        send_json(handler, {"message": "Utilisateur supprimé !"})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()


# --- EVENTS ROUTES ---

def handle_get_events(handler):
    parsed_url = urllib.parse.urlparse(handler.path)
    query_params = urllib.parse.parse_qs(parsed_url.query)
    page = int(query_params.get('page', [1])[0])
    limit = int(query_params.get('limit', [10])[0])
    offset = (page - 1) * limit
    conn = get_db_connection()
    try:
        total = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        events = conn.execute("SELECT * FROM events ORDER BY event_date ASC LIMIT ? OFFSET ?", (limit, offset)).fetchall()
        send_json(handler, {"data": [dict(e) for e in events], "total": total, "page": page, "total_pages": max(1, -(-total // limit))})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_get_event_detail(handler, event_id):
    conn = get_db_connection()
    try:
        event = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        if not event:
            return send_error(handler, "Événement introuvable.", 404)
        send_json(handler, dict(event))
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_create_event(handler):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
    body = read_json_body(handler)
    title = body.get('title', '').strip()
    description = body.get('description', '').strip()
    event_date = body.get('event_date', '').strip()
    location = body.get('location', '').strip()
    price = float(body.get('price', 0))
    total_tickets = int(body.get('total_tickets', 100))
    vip_price = float(body.get('vip_price', 0))
    vip_tickets = int(body.get('vip_tickets', 0))
    image_url = body.get('image_url', '').strip()
    image_base64 = body.get('image_base64')
    if not title or not event_date:
        return send_error(handler, "Titre et date requis.")
    if image_base64:
        ext = "jpg"
        if "data:image/png" in image_base64:
            ext = "png"
        elif "data:image/webp" in image_base64:
            ext = "webp"
        saved_path = save_base64_file(image_base64, UPLOAD_EVENTS_DIR, ext)
        if saved_path:
            image_url = saved_path
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO events (title, description, event_date, location, price, total_tickets, available_tickets, vip_price, vip_tickets, vip_available, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (title, description, event_date, location, price, total_tickets, total_tickets, vip_price, vip_tickets, vip_tickets, image_url)
        )
        conn.commit()
        send_json(handler, {"message": "Événement créé !", "id": cursor.lastrowid}, 201)
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_update_event(handler, event_id):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
    body = read_json_body(handler)
    title = body.get('title', '').strip()
    description = body.get('description', '').strip()
    event_date = body.get('event_date', '').strip()
    location = body.get('location', '').strip()
    price = float(body.get('price', 0))
    total_tickets = int(body.get('total_tickets', 100))
    available_tickets = int(body.get('available_tickets', total_tickets))
    vip_price = float(body.get('vip_price', 0))
    vip_tickets = int(body.get('vip_tickets', 0))
    vip_available = int(body.get('vip_available', vip_tickets))
    image_url = body.get('image_url', '').strip()
    image_base64 = body.get('image_base64')
    if not title or not event_date:
        return send_error(handler, "Titre et date requis.")
    if image_base64:
        ext = "jpg"
        if "data:image/png" in image_base64:
            ext = "png"
        elif "data:image/webp" in image_base64:
            ext = "webp"
        saved_path = save_base64_file(image_base64, UPLOAD_EVENTS_DIR, ext)
        if saved_path:
            image_url = saved_path
    conn = get_db_connection()
    try:
        if image_url:
            conn.execute(
                "UPDATE events SET title=?, description=?, event_date=?, location=?, price=?, total_tickets=?, available_tickets=?, vip_price=?, vip_tickets=?, vip_available=?, image_url=? WHERE id=?",
                (title, description, event_date, location, price, total_tickets, available_tickets, vip_price, vip_tickets, vip_available, image_url, event_id)
            )
        else:
            conn.execute(
                "UPDATE events SET title=?, description=?, event_date=?, location=?, price=?, total_tickets=?, available_tickets=?, vip_price=?, vip_tickets=?, vip_available=? WHERE id=?",
                (title, description, event_date, location, price, total_tickets, available_tickets, vip_price, vip_tickets, vip_available, event_id)
            )
        conn.commit()
        send_json(handler, {"message": "Événement mis à jour !"})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_delete_event(handler, event_id):
    user = get_current_user_from_request(handler)
    if not user or user['role'] != 'admin':
        return send_error(handler, "Accès interdit.", 403)
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
        conn.commit()
        send_json(handler, {"message": "Événement supprimé !"})
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

# --- TICKETS ROUTES ---

def handle_get_tickets(handler):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)
    conn = get_db_connection()
    try:
        tickets = conn.execute(
            """SELECT t.*, e.title as event_title, e.event_date as event_date
               FROM tickets t JOIN events e ON t.event_id = e.id
               WHERE t.user_id = ? ORDER BY t.created_at DESC""",
            (user['id'],)
        ).fetchall()
        send_json(handler, [dict(t) for t in tickets])
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_reserve_ticket(handler):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)
    body = read_json_body(handler)
    event_id = body.get('event_id')
    quantity = int(body.get('quantity', 1))
    ticket_type = body.get('ticket_type', 'normal')
    payment_method = body.get('payment_method', '').strip().lower()
    phone_number = body.get('phone_number', '').strip()
    if not event_id or quantity <= 0:
        return send_error(handler, "Données de réservation invalides.")
    conn = get_db_connection()
    try:
        event = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        if not event:
            return send_error(handler, "Événement introuvable.", 404)
        if ticket_type == 'vip':
            if event['vip_available'] < quantity:
                return send_error(handler, f"Seulement {event['vip_available']} places VIP disponibles.")
            total_price = event['vip_price'] * quantity
        else:
            if event['available_tickets'] < quantity:
                return send_error(handler, f"Seulement {event['available_tickets']} places disponibles.")
            total_price = event['price'] * quantity
        pay_res = None
        if payment_method and phone_number:
            if payment_method == 'mvola':
                pay_res = payment.initiate_mvola_payment(total_price, phone_number, 0)
            elif payment_method == 'orange_money':
                pay_res = payment.initiate_orange_money_payment(total_price, phone_number, 0)
            elif payment_method == 'airtel_money':
                pay_res = payment.initiate_airtel_money_payment(total_price, phone_number, 0)
            else:
                pay_res = payment.initiate_card_payment(total_price, "tok_simulated", 0)
            if not pay_res or not pay_res.get('success'):
                return send_error(handler, pay_res.get('error', "Échec de l'initialisation du paiement."))
            conn.execute(
                "INSERT INTO payments (user_id, amount, payment_method, transaction_id, status) VALUES (?, ?, ?, ?, ?)",
                (user['id'], total_price, payment_method, pay_res.get('transaction_id'), 'pending')
            )
        qr_token = str(uuid.uuid4())
        ticket_status = 'pending_payment' if (pay_res and pay_res.get('ussd_code')) else 'confirmed'
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO tickets (event_id, user_id, quantity, total_price, qr_token, ticket_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (event_id, user['id'], quantity, total_price, qr_token, ticket_type, ticket_status)
        )
        ticket_id = cursor.lastrowid
        if ticket_type == 'vip':
            cursor.execute("UPDATE events SET vip_available = vip_available - ? WHERE id = ?", (quantity, event_id))
        else:
            cursor.execute("UPDATE events SET available_tickets = available_tickets - ? WHERE id = ?", (quantity, event_id))
        conn.commit()
        response_data = {
            "ticket_id": ticket_id,
            "event_title": event['title'],
            "qr_token": qr_token,
            "quantity": quantity,
            "total_price": total_price,
            "ticket_type": ticket_type,
            "status": ticket_status
        }
        if pay_res and pay_res.get('ussd_code'):
            response_data["ussd_code"] = pay_res["ussd_code"]
            response_data["instruction"] = pay_res.get('instruction', f"Composez {pay_res['ussd_code']} sur votre téléphone.")
            response_data["transaction_id"] = pay_res.get('transaction_id')
            response_data["message"] = "Réservation en attente de paiement. Composez le code USSD pour confirmer."
        else:
            response_data["message"] = "Réservation confirmée !"
        send_json(handler, response_data, 201)
    except Exception as e:
        conn.rollback()
        send_error(handler, str(e), 500)
    finally:
        conn.close()

def handle_cancel_ticket(handler, ticket_id):
    user = get_current_user_from_request(handler)
    if not user:
        return send_error(handler, "Non authentifié.", 401)
    conn = get_db_connection()
    try:
        ticket = conn.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if not ticket:
            return send_error(handler, "Ticket introuvable.", 404)
        if ticket['user_id'] != user['id'] and user['role'] != 'admin':
            return send_error(handler, "Ce ticket ne vous appartient pas.", 403)
        if ticket['status'] == 'cancelled':
            return send_error(handler, "Ce ticket est déjà annulé.")
        cursor = conn.cursor()
        cursor.execute("UPDATE tickets SET status = 'cancelled' WHERE id = ?", (ticket_id,))
        if ticket['ticket_type'] == 'vip':
            cursor.execute("UPDATE events SET vip_available = vip_available + ? WHERE id = ?",
                           (ticket['quantity'], ticket['event_id']))
        else:
            cursor.execute("UPDATE events SET available_tickets = available_tickets + ? WHERE id = ?",
                           (ticket['quantity'], ticket['event_id']))
        conn.commit()
        send_json(handler, {"message": "Réservation annulée. Places remises en vente.", "ticket_id": int(ticket_id)})
    except Exception as e:
        conn.rollback()
        send_error(handler, str(e), 500)
    finally:
        conn.close()


def handle_verify_ticket(handler):
    user = get_current_user_from_request(handler)
    if not user or user['role'] not in ('admin', 'scanner'):
        return send_error(handler, "Accès interdit. Rôle scanner requis.", 403)
    body = read_json_body(handler)
    qr_token = body.get('qr_token', '').strip()
    if not qr_token:
        return send_error(handler, "qr_token requis.")
    conn = get_db_connection()
    try:
        ticket = conn.execute(
            "SELECT t.*, e.title as event_title, e.event_date FROM tickets t JOIN events e ON t.event_id = e.id WHERE t.qr_token = ?",
            (qr_token,)
        ).fetchone()
        if not ticket:
            return send_json(handler, {"valid": False, "message": "Ticket introuvable."}, 200)
        if ticket['status'] == 'cancelled':
            return send_json(handler, {"valid": False, "message": "Ce ticket a été annulé.", "ticket": dict(ticket)}, 200)
        if ticket['status'] == 'used':
            return send_json(handler, {"valid": False, "message": "Ce ticket a déjà été utilisé.", "ticket": dict(ticket)}, 200)
        user_info = conn.execute("SELECT fullname, email FROM users WHERE id = ?", (ticket['user_id'],)).fetchone()
        return send_json(handler, {
            "valid": True,
            "message": "Ticket valide !",
            "ticket": {
                "id": ticket['id'],
                "event_title": ticket['event_title'],
                "event_date": ticket['event_date'],
                "quantity": ticket['quantity'],
                "ticket_type": ticket['ticket_type'],
                "status": ticket['status'],
                "username": user_info['fullname'] if user_info else "Inconnu"
            }
        }, 200)
    except Exception as e:
        send_error(handler, str(e), 500)
    finally:
        conn.close()


# ROUTING ENTRY POINT

def dispatch_api_request(handler):
    try:
        path = handler.path
        method = handler.command
        
        # Enable CORS preflight
        if method == 'OPTIONS':
            return route_options(handler)
            
        # Standardize path by stripping query string
        parsed_path = urllib.parse.urlparse(path).path
        
        # 1. Auth routes
        if parsed_path == '/api/auth/register' and method == 'POST':
            return handle_register(handler)
        elif parsed_path == '/api/auth/login' and method == 'POST':
            return handle_login(handler)
        elif parsed_path == '/api/auth/logout' and method == 'POST':
            return handle_logout(handler)
        elif parsed_path == '/api/auth/profile' and method == 'GET':
            return handle_get_profile(handler)
        elif parsed_path == '/api/auth/profile' and method == 'PUT':
            return handle_update_profile(handler)
        elif parsed_path == '/api/auth/upgrade' and method == 'POST':
            return handle_upgrade_premium(handler)
            
        # 2. Categories
        elif parsed_path == '/api/categories' and method == 'GET':
            return handle_get_categories(handler)
            
        # 3. Products
        elif parsed_path == '/api/products' and method == 'GET':
            return handle_get_products(handler)
        elif parsed_path == '/api/products' and method == 'POST':
            return handle_create_product(handler)
        # Match /api/products/<id>
        elif re.match(r'^/api/products/(\d+)$', parsed_path):
            product_id = re.match(r'^/api/products/(\d+)$', parsed_path).group(1)
            if method == 'GET':
                return handle_get_product_detail(handler, product_id)
            elif method == 'PUT':
                return handle_update_product(handler, product_id)
            elif method == 'DELETE':
                return handle_delete_product(handler, product_id)
                
        # 4. Videos
        elif parsed_path == '/api/videos' and method == 'GET':
            return handle_get_videos(handler)
        elif parsed_path == '/api/videos' and method == 'POST':
            return handle_create_video(handler)
        # Match /api/videos/<id>
        elif re.match(r'^/api/videos/(\d+)$', parsed_path):
            video_id = re.match(r'^/api/videos/(\d+)$', parsed_path).group(1)
            if method == 'GET':
                return handle_get_video_detail(handler, video_id)
            elif method == 'PUT':
                return handle_update_video(handler, video_id)
            elif method == 'DELETE':
                return handle_delete_video(handler, video_id)
        # Match /api/videos/<id>/purchase
        elif re.match(r'^/api/videos/(\d+)/purchase$', parsed_path) and method == 'POST':
            video_id = re.match(r'^/api/videos/(\d+)/purchase$', parsed_path).group(1)
            return handle_purchase_video(handler, video_id)
            
        # 5. Favorites
        elif parsed_path == '/api/favorites' and method == 'GET':
            return handle_get_favorites(handler)
        elif parsed_path == '/api/favorites' and method == 'POST':
            return handle_toggle_favorite(handler)
            
        # 6. Orders
        elif parsed_path == '/api/orders' and method == 'GET':
            return handle_get_orders(handler)
        elif parsed_path == '/api/orders' and method == 'POST':
            return handle_create_order(handler)
        elif re.match(r'^/api/orders/(\d+)/delivery$', parsed_path) and method == 'PUT':
            order_id = re.match(r'^/api/orders/(\d+)/delivery$', parsed_path).group(1)
            return handle_update_delivery_status(handler, order_id)
            
        # 7. Admin
        elif parsed_path == '/api/admin/stats' and method == 'GET':
            return handle_admin_get_stats(handler)
        elif parsed_path == '/api/admin/orders' and method == 'GET':
            return handle_admin_get_orders(handler)
        elif parsed_path == '/api/admin/users' and method == 'GET':
            return handle_admin_get_users(handler)
        # Match /api/admin/users/<id>
        elif re.match(r'^/api/admin/users/(\d+)$', parsed_path):
            user_id = re.match(r'^/api/admin/users/(\d+)$', parsed_path).group(1)
            if method == 'PUT':
                return handle_admin_update_user(handler, user_id)
            elif method == 'DELETE':
                return handle_admin_delete_user(handler, user_id)
                
        # 8. Events
        elif parsed_path == '/api/events' and method == 'GET':
            return handle_get_events(handler)
        elif parsed_path == '/api/events' and method == 'POST':
            return handle_create_event(handler)
        elif re.match(r'^/api/events/(\d+)$', parsed_path):
            event_id = re.match(r'^/api/events/(\d+)$', parsed_path).group(1)
            if method == 'GET':
                return handle_get_event_detail(handler, event_id)
            elif method == 'PUT':
                return handle_update_event(handler, event_id)
            elif method == 'DELETE':
                return handle_delete_event(handler, event_id)
                
        # 9. Tickets
        elif parsed_path == '/api/tickets' and method == 'GET':
            return handle_get_tickets(handler)
        elif parsed_path == '/api/tickets/reserve' and method == 'POST':
            return handle_reserve_ticket(handler)
        elif re.match(r'^/api/tickets/(\d+)/cancel$', parsed_path) and method == 'POST':
            ticket_id = re.match(r'^/api/tickets/(\d+)/cancel$', parsed_path).group(1)
            return handle_cancel_ticket(handler, ticket_id)
        elif parsed_path == '/api/tickets/verify' and method == 'POST':
            return handle_verify_ticket(handler)
                
        # Route not matched
        send_error(handler, "Route introuvable.", 404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        try:
            send_error(handler, f"Erreur interne du serveur: {str(e)}", 500)
        except Exception:
            pass
