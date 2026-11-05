"""Umumiy yordamchilar: xatolar, xavfsizlik (parol, JWT, OTP, PIN), geo, so'rov konteksti."""
from __future__ import annotations

import hashlib
import hmac
import math
import secrets
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import jwt

from .config import settings
from .db import now


# ---------------------------------------------------------------- xatolar
class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details or {}


def not_found(what: str = "Obyekt") -> ApiError:
    # Boshqa tenant obyekti uchun ham 404 qaytariladi (AC-04): mavjudligi oshkor qilinmaydi.
    return ApiError(404, "not_found", f"{what} topilmadi")


def forbidden() -> ApiError:
    return ApiError(403, "forbidden", "Bu amal uchun ruxsat yo'q")


# ---------------------------------------------------------------- parol va xesh
def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260_000)
    return f"pbkdf2${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored or not stored.startswith("pbkdf2$"):
        return False
    _, salt_hex, digest_hex = stored.split("$")
    candidate = hash_password(password, bytes.fromhex(salt_hex)).split("$")[2]
    return hmac.compare_digest(candidate, digest_hex)


def hash_secret(value: str) -> str:
    """OTP va PIN kabi qisqa sirlar uchun kalitli xesh (bazadan o'g'irlansa ham tiklab bo'lmaydi)."""
    return hmac.new(settings.jwt_secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def random_digits(n: int) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(n))


# ---------------------------------------------------------------- JWT
def issue_token(user_id: str, kind: str = "access") -> str:
    exp = now() + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": user_id, "kind": kind, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise ApiError(401, "unauthorized", "Token yaroqsiz yoki muddati tugagan") from exc


# ---------------------------------------------------------------- foydalanuvchi konteksti
STAFF_ROLES = {"tenant_owner", "branch_manager", "picker", "dispatcher", "courier", "support", "finance",
               "platform_admin"}


@dataclass
class Principal:
    user_id: str
    phone: str
    full_name: str | None
    roles: list[dict] = field(default_factory=list)  # [{role, tenant_id, branch_id}]

    def has(self, *roles: str) -> bool:
        return any(r["role"] in roles for r in self.roles)

    @property
    def is_admin(self) -> bool:
        return self.has("platform_admin")

    def can_access_branch(self, tenant_id: str, branch_id: str | None, roles: tuple[str, ...]) -> bool:
        """Rol tenant/filial chegarasida tekshiriladi (TZ 6.5, 7.5)."""
        if self.is_admin:
            return True
        for r in self.roles:
            if r["role"] not in roles or r["tenant_id"] != tenant_id:
                continue
            if r["branch_id"] is None or branch_id is None or r["branch_id"] == branch_id:
                return True
        return False

    def tenant_ids(self) -> set[str]:
        return {r["tenant_id"] for r in self.roles if r["tenant_id"]}

    def public(self) -> dict[str, Any]:
        return {"id": self.user_id, "phone": self.phone, "full_name": self.full_name, "roles": self.roles}


# ---------------------------------------------------------------- geo
def point_in_polygon(lat: float, lon: float, polygon: dict) -> bool:
    """GeoJSON Polygon ichida nuqta bormi (ray casting). Koordinatalar [lon, lat] tartibida."""
    ring = polygon["coordinates"][0]
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def circle_polygon(lat: float, lon: float, radius_km: float, points: int = 32) -> dict:
    """Radiusli hududni GeoJSON poligonga aylantirish (hamkor radius bilan kiritganda)."""
    coords = []
    for k in range(points + 1):
        ang = 2 * math.pi * k / points
        dlat = radius_km / 111.32 * math.sin(ang)
        dlon = radius_km / (111.32 * math.cos(math.radians(lat))) * math.cos(ang)
        coords.append([round(lon + dlon, 6), round(lat + dlat, 6)])
    return {"type": "Polygon", "coordinates": [coords]}


# ---------------------------------------------------------------- miqdor va pul
def line_total(unit_price: int, qty_milli: int) -> int:
    """Narx (tiyin) × miqdor (milli birlik), butun tiyingacha yaxlitlanadi."""
    return (unit_price * qty_milli + 500) // 1000
