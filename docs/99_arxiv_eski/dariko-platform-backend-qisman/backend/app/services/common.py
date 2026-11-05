"""Audit, outbox hodisalari va idempotentlik (ADR-003)."""
from __future__ import annotations

import hashlib
import hmac
from typing import Any, Callable

from ..config import settings
from ..core import ApiError
from ..db import Conn, dumps, iso, loads


def audit(c: Conn, *, tenant_id: str | None, actor_id: str | None, entity: str, entity_id: str,
          action: str, old: Any = None, new: Any = None, request_id: str | None = None) -> None:
    c.insert("audit_log", {
        "tenant_id": tenant_id, "actor_id": actor_id, "entity": entity, "entity_id": entity_id,
        "action": action, "old_value": dumps(old) if old is not None else None,
        "new_value": dumps(new) if new is not None else None, "request_id": request_id, "created_at": iso(),
    })


def emit(c: Conn, *, tenant_id: str | None, aggregate_type: str, aggregate_id: str, event_type: str,
         payload: dict) -> None:
    """Hodisani biznes o'zgarishi bilan BIR tranzaksiyada yozish (transactional outbox)."""
    c.insert("outbox_events", {
        "tenant_id": tenant_id, "aggregate_type": aggregate_type, "aggregate_id": aggregate_id,
        "event_type": event_type, "payload": dumps(payload), "attempts": 0,
        "next_attempt_at": iso(), "created_at": iso(),
    })


def request_fingerprint(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def idempotent(c: Conn, *, scope: str, key: str | None, fingerprint: str,
               action: Callable[[], tuple[int, dict]]) -> tuple[int, dict]:
    """Bir xil kalit bilan takroriy so'rov saqlangan javobni qaytaradi (AC-03)."""
    if not key:
        raise ApiError(400, "idempotency_key_required", "Idempotency-Key sarlavhasi majburiy")
    existing = c.one("SELECT request_hash, response_code, response_body FROM idempotency_keys "
                     "WHERE scope = :s AND key = :k", {"s": scope, "k": key})
    if existing:
        if existing["request_hash"] != fingerprint:
            raise ApiError(422, "idempotency_key_reused", "Bu kalit boshqa so'rov uchun ishlatilgan")
        return existing["response_code"], loads(existing["response_body"])
    status, body = action()
    c.insert("idempotency_keys", {"key": key, "scope": scope, "request_hash": fingerprint,
                                  "response_code": status, "response_body": dumps(body), "created_at": iso()})
    return status, body


def sign_payload(body: bytes) -> str:
    return hmac.new(settings.payment_webhook_secret.encode(), body, hashlib.sha256).hexdigest()


def for_update(c: Conn) -> str:
    return " FOR UPDATE" if c.dialect == "postgres" else ""
