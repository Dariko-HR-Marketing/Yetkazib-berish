import uuid

from django.db import models


class PaymentStatus(models.TextChoices):
    PENDING = "pending"
    AUTHORIZED = "authorized"
    PAID = "paid"
    REFUNDING = "refunding"
    PARTIALLY_REFUNDED = "partially_refunded"
    REFUNDED = "refunded"
    FAILED = "failed"


class Payment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="payments")
    provider = models.CharField(max_length=20)                    # mock | payme | click | cash
    external_txn_id = models.CharField(max_length=120, null=True, blank=True)
    amount = models.BigIntegerField()
    refunded_amount = models.BigIntegerField(default=0)
    status = models.CharField(max_length=24, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    idempotency_key = models.UUIDField(unique=True)
    checkout_url = models.CharField(max_length=300, blank=True, default="")
    needs_attention = models.BooleanField(default=False)          # noaniq holat — operator navbati (AC-06)
    fiscal_receipt = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["provider", "external_txn_id"], name="uniq_provider_txn")]


class Refund(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    amount = models.BigIntegerField()
    reason = models.CharField(max_length=300)
    # requested (tasdiq kutadi) | approved (provayderga yuboriladi) | refunded | failed
    state = models.CharField(max_length=12, default="requested")
    requested_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approved_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    idempotency_key = models.UUIDField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
