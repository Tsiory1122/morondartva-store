import os
import re

DB_TYPE = os.environ.get('DB_TYPE', 'sqlite').lower()

if DB_TYPE == 'postgresql':
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        raise ImportError(
            "psycopg2 is required for PostgreSQL. Install it with: pip install psycopg2-binary"
        )

_PK_MAP = {'sessions': 'token'}


def get_db_connection():
    if DB_TYPE == 'postgresql':
        dsn = os.environ.get('DATABASE_URL', '')
        if not dsn:
            raise ValueError("DATABASE_URL environment variable is required for PostgreSQL")
        conn = psycopg2.connect(dsn)
        conn.autocommit = False
        return _PGConnection(conn)
    else:
        db_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'database.db'
        )
        import sqlite3
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn


def _adapt_query(query):
    query = query.replace('?', '%s')
    m = re.match(
        r"INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)",
        query, re.IGNORECASE
    )
    if m:
        table = m.group(1)
        cols = [c.strip() for c in m.group(2).split(',')]
        vals = m.group(3)
        pk = _PK_MAP.get(table.lower(), 'id')
        updates = ', '.join(f"{c} = EXCLUDED.{c}" for c in cols if c != pk)
        if updates:
            return (
                f"INSERT INTO {table} ({', '.join(cols)}) "
                f"VALUES ({vals}) "
                f"ON CONFLICT ({pk}) DO UPDATE SET {updates}"
            )
        return (
            f"INSERT INTO {table} ({', '.join(cols)}) "
            f"VALUES ({vals}) "
            f"ON CONFLICT ({pk}) DO NOTHING"
        )
    return query


class _Row(dict):
    def __getitem__(self, key):
        if isinstance(key, (int, slice)):
            return list(super().values())[key]
        return super().__getitem__(key)


class _PGConnection:
    def __init__(self, conn):
        self._conn = conn

    def execute(self, query, params=None):
        if query.strip().upper().startswith('PRAGMA'):
            return _PGResult(self._get_cursor())
        adapted = _adapt_query(query)
        cur = self._get_cursor()
        is_insert = adapted.strip().upper().startswith('INSERT')
        if is_insert and 'RETURNING' not in adapted.upper():
            adapted = adapted.rstrip(';') + ' RETURNING id;'
        if params is None:
            cur.execute(adapted)
        else:
            cur.execute(adapted, params)
        row_id = None
        if is_insert and cur.description:
            try:
                row = cur.fetchone()
                if row:
                    row_id = row['id']
            except Exception:
                pass
        return _PGResult(cur, row_id)

    def cursor(self):
        return _PGCursor(self._conn)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def _get_cursor(self):
        return self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


class _PGCursor:
    def __init__(self, conn):
        self._conn = conn
        self._cur = None
        self._lastrowid = None

    def execute(self, query, params=None):
        if query.strip().upper().startswith('PRAGMA'):
            self._cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            self._lastrowid = None
            return self
        adapted = _adapt_query(query)
        self._cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        is_insert = adapted.strip().upper().startswith('INSERT')
        if is_insert and 'RETURNING' not in adapted.upper():
            adapted = adapted.rstrip(';') + ' RETURNING id;'
        if params is None:
            self._cur.execute(adapted)
        else:
            self._cur.execute(adapted, params)
        self._lastrowid = None
        if is_insert and self._cur.description:
            try:
                row = self._cur.fetchone()
                if row:
                    self._lastrowid = row['id']
            except Exception:
                pass
        return self

    def executemany(self, query, seq):
        adapted = _adapt_query(query)
        self._cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        for params in seq:
            self._cur.execute(adapted, params)

    @property
    def lastrowid(self):
        return self._lastrowid

    def fetchone(self):
        if self._cur is None:
            return None
        row = self._cur.fetchone()
        return _Row(row) if row else None

    def fetchall(self):
        if self._cur is None:
            return []
        return [_Row(r) for r in self._cur.fetchall()]


class _PGResult:
    def __init__(self, cursor, lastrowid=None):
        self._cursor = cursor
        self._lastrowid = lastrowid

    def fetchone(self):
        row = self._cursor.fetchone()
        return _Row(row) if row else None

    def fetchall(self):
        return [_Row(r) for r in self._cursor.fetchall()]

    @property
    def lastrowid(self):
        return self._lastrowid
