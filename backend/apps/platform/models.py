import uuid

from django.db import models


class IdempotencyKey(models.Model):
    key = models.UUIDField(primary_key=True)
    scope = models.CharField(max_length=100)
    request_hash = models.CharField(max_length=64)
    response_code = models.IntegerField(null=True)
    response_body = models.JSONField(null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)


class OutboxEvent(models.Model):
    """Transactional outbox (ADR-003)."""
    tenant_id = models.UUIDField(null=True, blank=True)
    aggregate_type = models.CharField(max_length=30)
    aggregate_id = models.UUIDField()
    event_type = models.CharField(max_length=60)
    payload = models.JSONField(default=dict)
    attempts = models.IntegerField(default=0)
    next_attempt_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    dead_lettered_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["next_attempt_at"], name="outbox_due_idx",
                                condition=models.Q(sent_at__isnull=True, dead_lettered_at__isnull=True))]


class InboundWebhook(models.Model):
    provider = models.CharField(max_length=30)
    external_event_id = models.CharField(max_length=120)
    payload = models.JSONField()
    processed_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["provider", "external_event_id"], name="uniq_inbound_event")]


class AuditLog(models.Model):
    """Faqat qo'shish (NFR-12). update/delete model darajasida taqiqlangan."""
    tenant_id = models.UUIDField(null=True, blank=True, db_index=True)
    actor_id = models.UUIDField(null=True, blank=True)
    entity = models.CharField(max_length=40)
    entity_id = models.CharField(max_length=100)
    action = models.CharField(max_length=60)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    request_id = models.CharField(max_length=40, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def save(self, *a, **kw):
        if self.pk:
            raise PermissionError("AuditLog o'zgartirilmaydi")
        super().save(*a, **kw)

    def delete(self, *a, **kw):
        raise PermissionError("AuditLog o'chirilmaydi")


class Notification(models.Model):
    """Yuborilgan xabarlar jurnali (console provayder uchun ham)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    audience = models.CharField(max_length=20)       # customer | partner | courier
    phone = models.CharField(max_length=20, blank=True, default="")
    channel = models.CharField(max_length=20)
    template = models.CharField(max_length=60)
    text = models.TextField()
    order_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
