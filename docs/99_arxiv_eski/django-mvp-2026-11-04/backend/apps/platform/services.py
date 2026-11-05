"""Umumiy xizmatlar: audit, outbox, idempotentlik (ADR-003)."""
import hashlib
import json
import logging
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.response import Response

from .errors import ApiError
from .middleware import request_id_var
from .models import AuditLog, IdempotencyKey, OutboxEvent

log = logging.getLogger(__name__)


def audit(entity, entity_id, action, *, tenant_id=None, actor=None, old=None, new=None, request=None):
    ip = None
    if request is not None:
        ip = (request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR")) or None
    AuditLog.objects.create(
        tenant_id=tenant_id, actor_id=getattr(actor, "id", actor), entity=entity, entity_id=str(entity_id),
        action=action, old_value=old, new_value=new, ip=ip, request_id=request_id_var.get(),
    )


def emit(event_type, aggregate_type, aggregate_id, payload=None, tenant_id=None):
    """Biznes o'zgarishi bilan bitta tranzaksiyada chaqiriladi."""
    return OutboxEvent.objects.create(
        tenant_id=tenant_id, aggregate_type=aggregate_type, aggregate_id=aggregate_id,
        event_type=event_type, payload=payload or {},
    )


def run_idempotent(request, scope, handler):
    """Idempotency-Key bilan himoyalangan POST. handler() -> (body_dict, status_code).

    Bir xil kalit bilan ikki parallel so'rov: ikkinchisi unique indeksda kutadi va birinchi
    commit qilgach saqlangan javobni oladi (AC-03). Xatoda tranzaksiya (va kalit) bekor bo'ladi,
    shuning uchun qayta urinish xavfsiz."""
    raw = request.headers.get("Idempotency-Key", "")
    try:
        key = uuid.UUID(raw)
    except ValueError:
        raise ApiError(400, "idempotency_key_required")
    digest = hashlib.sha256(request.body or b"").hexdigest()
    path_scope = f"{scope}:{getattr(request.user, 'id', 'anon')}"
    with transaction.atomic():
        try:
            with transaction.atomic():
                rec = IdempotencyKey.objects.create(key=key, scope=path_scope, request_hash=digest)
        except IntegrityError:
            rec = IdempotencyKey.objects.get(key=key)
            if rec.request_hash != digest or rec.scope != path_scope:
                raise ApiError(422, "idempotency_key_reuse")
            if rec.response_code is None:
                raise ApiError(409, "request_in_progress")
            resp = Response(rec.response_body, status=rec.response_code)
            resp["Idempotent-Replayed"] = "true"
            return resp
        body, code = handler()
        rec.response_code, rec.response_body = code, json.loads(json.dumps(body, default=str))
        rec.save(update_fields=["response_code", "response_body"])
        return Response(rec.response_body, status=code)


def purge_idempotency_keys():
    cutoff = timezone.now() - timedelta(hours=settings.IDEMPOTENCY_TTL_HOURS)
    return IdempotencyKey.objects.filter(created_at__lt=cutoff).delete()[0]


# ---------------- Outbox worker ----------------
_handlers = {}


def handler(*event_types):
    def deco(fn):
        for t in event_types:
            _handlers[t] = fn
        return fn
    return deco


def process_outbox(limit=50):
    """Vaqti kelgan hodisalarni yuboradi. Xatoda eksponensial kechikish; 10 urinishdan keyin dead-letter."""
    done = 0
    for _ in range(limit):
        with transaction.atomic():
            ev = (OutboxEvent.objects.select_for_update(skip_locked=True)
                  .filter(sent_at__isnull=True, dead_lettered_at__isnull=True, next_attempt_at__lte=timezone.now())
                  .order_by("id").first())
            if ev is None:
                break
            try:
                fn = _handlers.get(ev.event_type) or _handlers.get(ev.event_type.split(".")[0] + ".*")
                if fn:
                    with transaction.atomic():
                        fn(ev)
                ev.sent_at = timezone.now()
            except Exception as exc:  # noqa: BLE001
                ev.attempts += 1
                ev.last_error = f"{type(exc).__name__}: {exc}"[:500]
                if ev.attempts >= settings.OUTBOX_MAX_ATTEMPTS:
                    ev.dead_lettered_at = timezone.now()
                    log.error("OUTBOX dead-letter id=%s type=%s err=%s", ev.id, ev.event_type, ev.last_error)
                    audit("outbox", ev.id, "dead_letter", tenant_id=ev.tenant_id, new={"type": ev.event_type, "error": ev.last_error})
                else:
                    ev.next_attempt_at = timezone.now() + timedelta(seconds=min(30 * 2 ** (ev.attempts - 1), 3600))
            ev.save()
            done += 1
    return done
