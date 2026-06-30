import os
import sys
import ssl
import threading
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler
from database import initialize_database
from routes import dispatch_api_request

PORT = int(os.environ.get('PORT', 8000))
HTTPS_PORT = int(os.environ.get('HTTPS_PORT', 8443))
HOST = os.environ.get('HOST', '0.0.0.0')

# SSL certificate paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
CERT_FILE = os.path.join(SERVER_DIR, 'cert.pem')
KEY_FILE = os.path.join(SERVER_DIR, 'key.pem')

# Ensure correct base directory paths
CLIENT_DIR = os.path.join(BASE_DIR, 'client')
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')

class CustomHTTPRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silence default request logs to make console output readable
        print(f"[{self.date_time_string()}] {self.command} {self.path} - {args[1]}")

    def do_OPTIONS(self):
        # Delegate CORS preflight
        dispatch_api_request(self)

    def do_GET(self):
        # Check if it's an API route
        if self.path.startswith('/api/'):
            dispatch_api_request(self)
            return

        # Serve static files
        self.serve_static_file()

    def do_POST(self):
        if self.path.startswith('/api/'):
            dispatch_api_request(self)
            return
        self.send_error(404, "Not Found")

    def do_PUT(self):
        if self.path.startswith('/api/'):
            dispatch_api_request(self)
            return
        self.send_error(404, "Not Found")

    def do_DELETE(self):
        if self.path.startswith('/api/'):
            dispatch_api_request(self)
            return
        self.send_error(404, "Not Found")

    def check_media_access(self, path):
        # Public access to everything except secure video uploads
        if not path.startswith('/uploads/videos/'):
            return True

        filename = os.path.basename(path)
        
        # Check database for exclusive access configuration
        from database import get_db_connection
        conn = get_db_connection()
        try:
            video = conn.execute(
                "SELECT id, is_exclusive FROM videos WHERE video_url LIKE ?",
                (f"%{filename}",)
            ).fetchone()
            
            if not video or not video['is_exclusive']:
                return True
                
            # Exclusive video requires valid premium membership or specific purchase
            from auth import get_current_user_from_request
            user = get_current_user_from_request(self)
            if not user:
                return False
                
            if user['role'] == 'admin' or user['subscription_status'] == 'premium':
                return True
                
            purchased = conn.execute(
                "SELECT id FROM purchased_videos WHERE user_id = ? AND video_id = ?",
                (user['id'], video['id'])
            ).fetchone()
            
            return bool(purchased)
        except Exception as e:
            print(f"Error checking media access: {e}")
            return False
        finally:
            conn.close()

    def serve_static_file(self):
        path = self.path.split('?')[0] # Remove query strings

        # Default root path to index.html
        if path == '/' or path == '':
            path = '/index.html'

        # Resolve the actual file system path
        if path.startswith('/uploads/'):
            if not self.check_media_access(path):
                self.send_error(403, "Accès interdit : Abonnement Premium requis.")
                return
            file_path = os.path.join(BASE_DIR, path.lstrip('/'))
        else:
            # Client files
            # Strip '/client/' prefix if user added it in code, otherwise assume relative to client/
            clean_path = path.replace('/client/', '')
            file_path = os.path.join(CLIENT_DIR, clean_path.lstrip('/'))

        # Check if file exists and is not a directory
        if os.path.exists(file_path) and os.path.isfile(file_path):
            self.send_response(200)
            
            # Guess and set content type
            content_type, _ = mimetypes.guess_type(file_path)
            if not content_type:
                content_type = 'application/octet-stream'
                
            # Extra overrides for JS and CSS if needed
            if file_path.endswith('.js'):
                content_type = 'application/javascript'
            elif file_path.endswith('.css'):
                content_type = 'text/css'
                
            self.send_header('Content-Type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Write file in chunks to handle large video files / assets smoothly
            try:
                with open(file_path, 'rb') as f:
                    while True:
                        chunk = f.read(64 * 1024) # 64KB chunks
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            except Exception as e:
                print(f"Error reading file {file_path}: {e}")
        else:
            # SPA fallback: if it doesn't look like a direct file request (no extension), fallback to index.html
            _, ext = os.path.splitext(path)
            if not ext:
                index_path = os.path.join(CLIENT_DIR, 'index.html')
                if os.path.exists(index_path):
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    with open(index_path, 'rb') as f:
                        self.wfile.write(f.read())
                    return
            
            self.send_error(404, f"File Not Found: {path}")

def run():
    # Make sure database is ready
    print("Checking database status...")
    initialize_database()

    # Register mime types
    mimetypes.init()

    ssl_available = os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE)

    # Start HTTP server
    httpd = HTTPServer((HOST, PORT), CustomHTTPRequestHandler)
    print(f"============================================================")
    print(f"  MORONDARTVA-STORE SERVER STARTED SUCCESSFULLY")
    print(f"  HTTP:  http://localhost:{PORT}")
    print(f"        http://{HOST}:{PORT}")
    
    if ssl_available:
        # Start HTTPS server with SSL
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(CERT_FILE, KEY_FILE)
        httpd_https = HTTPServer((HOST, HTTPS_PORT), CustomHTTPRequestHandler)
        httpd_https.socket = ctx.wrap_socket(httpd_https.socket, server_side=True)
        print(f"  HTTPS: https://localhost:{HTTPS_PORT}")
        print(f"         https://{HOST}:{HTTPS_PORT}")
        print(f"")
        print(f"  Camera requires HTTPS on mobile.")
        print(f"  Connect via HTTPS for camera scanning.")
        # Run HTTPS in a separate thread
        def serve_https():
            try:
                httpd_https.serve_forever()
            except Exception as e:
                print(f"HTTPS server error: {e}")
        t = threading.Thread(target=serve_https, daemon=True)
        t.start()
    else:
        print(f"  HTTPS not available (cert.pem/key.pem missing)")
        print(f"  Run: openssl req -x509 -newkey rsa:2048 -keyout server/key.pem")
        print(f"       -out server/cert.pem -days 3650 -nodes -subj '/CN=localhost'")
    
    print(f"============================================================")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()
        if ssl_available:
            httpd_https.server_close()
        sys.exit(0)

if __name__ == '__main__':
    run()
