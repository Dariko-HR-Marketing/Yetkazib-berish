"""Xabarnomalar va outbox ishlovchisi (TZ 6.6, ADR-003, INT-MSG).

Hodisa → shablon → kanal adapteri. Xato bo'lsa eksponensial kechikish bilan qayta urinish,
`OUTBOX_MAX_ATTEMPTS` dan keyin dead-letter holatiga o'tkaziladi.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Protocol

from ..config import settings
from ..db import Conn, Database, iso, loads, now
from .common import for_update

log = logging.getLogger("dariko.notifications")

TEMPLATES = {
    "order.created": "Buyurtma {number} qabul qilindi. Holatini kuzating: {url}",
    "order.accepted": "Buyurtma {number} tasdiqlandi va tayyorlanishga yuborildi.",
    "order.approval_required": "Buyurtma {number}: almashtirish yoki summa o'zgarishini tasdiqlang: {url}",
    "order.ready": "Buyurtma {number} tayyor, tez orada kuryerga topshiriladi.",
    "order.in_delivery": "Kuryer yo'lga chiqdi. Buyurtma {number}: {url}",
    "order.completed": "Buyurtma {number} topshirildi. Rahmat! Baholash: {url}",
    "order.cancelled": "Buyurtma {number} bekor qilindi. To'lov bo'lsa, qaytariladi.",
    "payment.paid": "Buyurtma {number} uchun to'lov qabul qilindi.",
}


class MessageProvider(Protocol):
    def send(self, c: Conn, recipient: str, template: str, body: str) -> None: ...


class ConsoleProvider:
    """Ishlab chiqish rejimi: xabar `message_log` jadvaliga va logga yoziladi."""

    channel = "console"

    def send(self, c: Conn, recipient: str, template: str, body: str) -> None:
        c.insert("message_log", {"channel": self.channel, "recipient": recipient, "template": template,
                                 "body": body, "created_at": iso()})
        log.info("SMS -> %s: %s", recipient, body)


class SmsHttpProvider(ConsoleProvider):
    """SMS provayderi adapteri — G1 da provayder (Eskiz, Play Mobile va h.k.) tanlangach ulanadi."""

    channel = "sms"

    def send(self, c: Conn, recipient: str, template: str, body: str) -> None:  # pragma: no cover
        raise RuntimeError("SMS provayderi sozlanmagan (SMS_PROVIDER_URL)")


def provider() -> MessageProvider:
    return {"console": ConsoleProvider(), "sms": SmsHttpProvider()}[settings.message_provider]


def render(event_type: str, payload: dict) -> str | None:
    tpl = TEMPLATES.get(event_type)
    if not tpl:
        return None
    url = f"{settings.public_base_url}/t/{payload.get('tracking_token', '')}"
    return tpl.format(number=payload.get("number", ""), url=url)


def process_outbox(database: Database, limit: int = 50) -> dict:
    """Bitta to'plamni qayta ishlash. Worker buni har bir necha soniyada chaqiradi."""
    sent = failed = dead = 0
    with database.tx() as c:
        skip = " SKIP LOCKED" if c.dialect == "postgres" else ""
        rows = c.all("SELECT * FROM outbox_events WHERE sent_at IS NULL AND dead_lettered_at IS NULL "
                     f"AND next_attempt_at <= :n ORDER BY id LIMIT {int(limit)}{for_update(c)}{skip}", {"n": iso()})
        for ev in rows:
            payload = loads(ev["payload"])
            try:
                body = render(ev["event_type"], payload)
                if body and payload.get("phone"):
                    provider().send(c, payload["phone"], ev["event_type"], body)
                c.execute("UPDATE outbox_events SET sent_at = :t, attempts = attempts + 1 WHERE id = :id",
                          {"t": iso(), "id": ev["id"]})
                sent += 1
            except Exception as exc:  # noqa: BLE001 — har qanday adapter xatosi qayta urinishga
                attempts = ev["attempts"] + 1
                if attempts >= settings.outbox_max_attempts:
                    c.execute("UPDATE outbox_events SET attempts = :a, dead_lettered_at = :t, last_error = :e "
                              "WHERE id = :id", {"a": attempts, "t": iso(), "e": str(exc)[:500], "id": ev["id"]})
                    dead += 1
                    log.error("Outbox %s dead-letter: %s", ev["id"], exc)
                else:
                    delay = timedelta(minutes=2 ** (attempts - 1))
                    c.execute("UPDATE outbox_events SET attempts = :a, next_attempt_at = :n, last_error = :e "
                              "WHERE id = :id", {"a": attempts, "n": iso(now() + delay), "e": str(exc)[:500],
                                                 "id": ev["id"]})
                    failed += 1
    return {"sent": sent, "retry": failed, "dead": dead}
