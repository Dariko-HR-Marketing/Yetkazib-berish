"""Ma'lumotlar bazasi qatlami.

Bitta interfeys ikki dialektda ishlaydi:
  * SQLite  — lokal ishlab chiqish va avtomatik testlar (qo'shimcha o'rnatishsiz);
  * PostgreSQL — staging va production (psycopg 3 orqali).

SQL so'rovlar `:nom` ko'rinishidagi parametrlar bilan yoziladi; PostgreSQL uchun ular
avtomatik `%(nom)s` ga o'giriladi. Har bir yozuvchi amal `db.tx()` ichida bajariladi.
"""
from __future__ import annotations

import json
import re
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from .config import settings

_PARAM = re.compile(r"(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)")


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None = None) -> str:
    return (dt or now()).astimezone(timezone.utc).isoformat(timespec="seconds")


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def loads(value: Any) -> Any:
    """JSON ustunini o'qish: SQLite matn qaytaradi, PostgreSQL esa tayyor obyekt."""
    if value is None or not isinstance(value, (str, bytes)):
        return value
    return json.loads(value)


class Conn:
    """Bitta tranzaksiya ichidagi ulanish ustidagi yupqa o'ram."""

    def __init__(self, raw: Any, dialect: str):
        self.raw = raw
        self.dialect = dialect

    def _sql(self, sql: str) -> str:
        if self.dialect == "postgres":
            return _PARAM.sub(r"%(\1)s", sql.replace("%", "%%"))
        return sql

    def execute(self, sql: str, params: dict | None = None) -> int:
        cur = self.raw.cursor()
        cur.execute(self._sql(sql), params or {})
        return cur.rowcount

    def all(self, sql: str, params: dict | None = None) -> list[dict]:
        cur = self.raw.cursor()
        cur.execute(self._sql(sql), params or {})
        return [_normalize(r) for r in cur.fetchall()]

    def one(self, sql: str, params: dict | None = None) -> dict | None:
        rows = self.all(sql, params)
        return rows[0] if rows else None

    def scalar(self, sql: str, params: dict | None = None) -> Any:
        row = self.one(sql, params)
        return next(iter(row.values())) if row else None

    def insert(self, table: str, values: dict) -> dict:
        cols = ", ".join(values)
        marks = ", ".join(f":{k}" for k in values)
        self.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", values)
        return values


def _normalize(row: Any) -> dict:
    out = dict(row)
    for k, v in out.items():
        if isinstance(v, datetime):
            out[k] = iso(v)
    return out


class Database:
    def __init__(self, url: str):
        self.url = url
        if url.startswith("sqlite"):
            self.dialect = "sqlite"
            self.path = url.split("sqlite:///", 1)[1] if "///" in url else ":memory:"
        elif url.startswith(("postgres://", "postgresql://")):
            self.dialect = "postgres"
        else:
            raise ValueError(f"Qo'llab-quvvatlanmaydigan DATABASE_URL: {url}")
        self._lock = threading.Lock()  # SQLite: yozuvchi tranzaksiyalarni ketma-ket qilish

    def _connect(self):
        if self.dialect == "sqlite":
            raw = sqlite3.connect(self.path, timeout=30, isolation_level=None, check_same_thread=False)
            raw.row_factory = sqlite3.Row
            raw.execute("PRAGMA foreign_keys = ON")
            raw.execute("PRAGMA journal_mode = WAL")
            return raw
        import psycopg  # production bog'liqligi
        from psycopg.rows import dict_row

        return psycopg.connect(self.url, row_factory=dict_row, autocommit=False)

    @contextmanager
    def tx(self, write: bool = True) -> Iterator[Conn]:
        raw = self._connect()
        conn = Conn(raw, self.dialect)
        try:
            if self.dialect == "sqlite":
                raw.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield conn
            raw.commit() if self.dialect == "postgres" else raw.execute("COMMIT")
        except BaseException:
            try:
                raw.rollback() if self.dialect == "postgres" else raw.execute("ROLLBACK")
            except Exception:
                pass
            raise
        finally:
            raw.close()

    def read(self) -> Any:
        return self.tx(write=False)


db = Database(settings.database_url)


def set_database(url: str) -> Database:
    """Testlar va CLI uchun bazani almashtirish."""
    global db
    db = Database(url)
    import app.db as module

    module.db = db
    return db


def get_db() -> Database:
    import app.db as module

    return module.db
