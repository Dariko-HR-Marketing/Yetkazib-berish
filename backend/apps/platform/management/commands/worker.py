"""Fon ishchi: outbox, taymautlar, rezerv muddati, to'lov holati tekshiruvi, SLA (ADR-003)."""
import logging
import time

from django.core.management.base import BaseCommand

log = logging.getLogger("worker")


def tick():
    from apps.orders import services as o
    from apps.payments import services as p
    from apps.platform.services import process_outbox, purge_idempotency_keys
    return {"timeouts": o.apply_timeouts(), "expired": o.expire_reservations(), "sla": o.sla_alerts(),
            "payments": p.reconcile_pending(), "outbox": process_outbox(), "purged": purge_idempotency_keys()}


class Command(BaseCommand):
    help = "Fon ishchi (doimiy). --once bitta tsikl."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--interval", type=float, default=5.0)

    def handle(self, *a, **o):
        while True:
            try:
                r = tick()
                if any(r.values()):
                    log.info("worker: %s", r)
            except Exception:  # noqa: BLE001
                log.exception("worker xatosi")
            if o["once"]:
                return
            time.sleep(o["interval"])
