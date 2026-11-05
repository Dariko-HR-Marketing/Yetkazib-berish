import uuid

from django.db import models


class OrderStatus(models.TextChoices):
    CREATED = "created"
    PENDING_CONFIRMATION = "pending_confirmation"
    ACCEPTED = "accepted"
    PREPARING = "preparing"
    READY = "ready"
    IN_DELIVERY = "in_delivery"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Order(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20, unique=True)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    branch = models.ForeignKey("tenants.Branch", on_delete=models.PROTECT)
    customer = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    customer_phone = models.CharField(max_length=20)
    customer_name = models.CharField(max_length=120, blank=True, default="")
    address = models.JSONField()                                   # buyurtma vaqtidagi nusxa
    slot = models.ForeignKey("tenants.TimeSlot", null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=24, choices=OrderStatus.choices, default=OrderStatus.CREATED)
    version = models.IntegerField(default=1)
    channel = models.CharField(max_length=20, default="web")      # web | telegram | qr | instagram
    utm = models.JSONField(null=True, blank=True)
    payment_method = models.CharField(max_length=20)               # online | cash_on_delivery | card_on_delivery
    substitution_rule = models.CharField(max_length=20, default="suggest_similar")
    consent_increase_pct = models.DecimalField(max_digits=5, decimal_places=2, default=10)
    subtotal = models.BigIntegerField()
    delivery_fee = models.BigIntegerField(default=0)
    discount = models.BigIntegerField(default=0)
    total = models.BigIntegerField()
    final_total = models.BigIntegerField(null=True, blank=True)    # yig'ishdan keyin
    reserve_expires_at = models.DateTimeField(null=True, blank=True)
    estimated_ready_at = models.DateTimeField(null=True, blank=True)
    stock_committed = models.BooleanField(default=False)
    approval_state = models.CharField(max_length=10, default="none")  # none | pending | approved | declined
    approval_deadline = models.DateTimeField(null=True, blank=True)
    approved_total = models.BigIntegerField(null=True, blank=True)
    balance_due = models.BigIntegerField(default=0)                 # topshirishda qo'shimcha to'lanadigan summa
    confirm_deadline = models.DateTimeField(null=True, blank=True)
    sla_alerted = models.BooleanField(default=False)
    manual_reason = models.CharField(max_length=40, blank=True, default="")
    cancel_reason = models.TextField(blank=True, default="")
    tracking_token = models.CharField(max_length=64, unique=True)
    tracking_expires_at = models.DateTimeField()
    comment = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["tenant", "branch", "status", "-created_at"])]

    @property
    def payable_total(self):
        return self.final_total if self.final_total is not None else self.total


class OrderItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, related_name="+")
    name_snapshot = models.JSONField()
    unit_price = models.BigIntegerField()
    cost_snapshot = models.BigIntegerField(default=0)
    requested_qty = models.DecimalField(max_digits=12, decimal_places=3)
    actual_qty = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    modifiers = models.JSONField(default=list, blank=True)
    modifiers_price = models.BigIntegerField(default=0)            # bir birlik uchun
    is_weighted = models.BooleanField(default=False)
    substitution_rule = models.CharField(max_length=20, null=True, blank=True)
    substituted_by = models.ForeignKey("catalog.Variant", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    proposed_price = models.BigIntegerField(null=True, blank=True)
    proposal_deadline = models.DateTimeField(null=True, blank=True)
    serial_number = models.CharField(max_length=64, blank=True, default="")
    # pending | picked | substitution_proposed | substituted | weight_pending | removed
    status = models.CharField(max_length=24, default="pending")

    def line_total(self):
        if self.status == "removed":
            return 0
        qty = self.actual_qty if self.actual_qty is not None else self.requested_qty
        unit = self.proposed_price if (self.status == "substituted" and self.proposed_price is not None) else self.unit_price
        return int(round((unit + self.modifiers_price) * qty))


class OrderVersion(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="versions")
    version = models.IntegerField()
    snapshot = models.JSONField()
    reason = models.CharField(max_length=80)
    customer_approved = models.BooleanField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["order", "version"], name="uniq_order_version")]


class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="history")
    from_status = models.CharField(max_length=24, null=True, blank=True)
    to_status = models.CharField(max_length=24)
    actor_id = models.UUIDField(null=True, blank=True)
    reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
