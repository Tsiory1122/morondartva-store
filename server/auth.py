import uuid
import time
from database import get_db_connection

SESSION_EXPIRY_SECONDS = 86400 * 7  # 7 days - sessions survive server restarts


def _ensure_sessions_table():
    """Create sessions table in DB if it doesn't exist."""
    conn = get_db_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at REAL NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);")
        conn.commit()
    finally:
        conn.close()


# Ensure table exists on import
_ensure_sessions_table()


def create_session(user_id: int, email: str, role: str) -> str:
    """Generate a session token and persist it in the database."""
    token = uuid.uuid4().hex
    expiry = time.time() + SESSION_EXPIRY_SECONDS

    conn = get_db_connection()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expiry)
        )
        conn.commit()
    finally:
        conn.close()

    return token


def get_session_user(token: str):
    """Retrieve and validate a session token from the database."""
    if not token:
        return None

    conn = get_db_connection()
    try:
        session = conn.execute(
            "SELECT * FROM sessions WHERE token = ?", (token,)
        ).fetchone()

        if not session:
            return None

        # Check expiry
        if time.time() > session['expires_at']:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            return None

        # Refresh session expiry on access
        new_expiry = time.time() + SESSION_EXPIRY_SECONDS
        conn.execute(
            "UPDATE sessions SET expires_at = ? WHERE token = ?",
            (new_expiry, token)
        )
        conn.commit()

        return dict(session)
    finally:
        conn.close()


def destroy_session(token: str) -> bool:
    """Remove a session token from the database."""
    if not token:
        return False
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        return True
    finally:
        conn.close()


def clean_expired_sessions():
    """Remove all expired sessions from the database."""
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))
        conn.commit()
    finally:
        conn.close()


def get_current_user_from_request(request_handler) -> dict:
    """
    Extract session token from Authorization header or Cookie,
    verify it, and fetch updated user details from database.
    """
    token = None

    # 1. Check Authorization Header
    auth_header = request_handler.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]

    # 2. Check Cookie header if not found in Authorization
    if not token:
        cookie_header = request_handler.headers.get('Cookie')
        if cookie_header:
            cookies = {}
            for item in cookie_header.split(';'):
                item = item.strip()
                if '=' in item:
                    k, v = item.split('=', 1)
                    cookies[k.strip()] = v.strip()
            token = cookies.get('session_id')

    if not token:
        return None

    session = get_session_user(token)
    if not session:
        return None

    # Query fresh details from db (to get latest role, subscription status)
    conn = get_db_connection()
    try:
        user = conn.execute(
            "SELECT id, email, fullname, role, subscription_status FROM users WHERE id = ?",
            (session['user_id'],)
        ).fetchone()
        if user:
            return dict(user)
    except Exception as e:
        print(f"Error fetching session user: {e}")
    finally:
        conn.close()

    return None
