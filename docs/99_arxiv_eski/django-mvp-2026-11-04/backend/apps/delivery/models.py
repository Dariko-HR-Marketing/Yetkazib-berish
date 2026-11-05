import uuid

from django.db import models


class ShipmentStatus(models.TextChoices):
    CREATED = "created"
    ASSIGNED = "assigned"
    PICKED_UP = "picked_up"
    ON_THE_WAY = "on_the_way"
    DELIVERED = "delivered"
    FAILED = "failed"
    RETURNED = "returned"


class Shipment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    branch = models.ForeignKey("tenants.Branch", on_delete=models.PROTECT)
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="shipments")
    courier = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="shipments")
    provider = models.CharField(max_length=30, default="own")     # own | yandex_delivery ...
    external_id = models.CharField(max_length=80, blank=True, default="")
    vehicle_type = models.CharField(max_length=10, default="bike")  # foot | bike | car | van (talab qilingan minimum)
    status = models.CharField(max_length=12, choices=ShipmentStatus.choices, default=ShipmentStatus.CREATED)
    pin_nonce = models.CharField(max_length=16, default="")
    pin_code_hash = models.CharField(max_length=64, blank=True, default="")
    pin_attempts = models.IntegerField(default=0)
    pod_type = models.CharField(max_length=10, blank=True, default="")
    pod_url = models.CharField(max_length=300, blank=True, default="")
    failure_reason = models.CharField(max_length=300, blank=True, default="")
    contact_attempts = models.IntegerField(default=0)
    first_contact_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.JSONField(default=list, blank=True)       # rad etgan kuryerlar
    attention = models.CharField(max_length=40, blank=True, default="")  # dispetcher e'tibori: rejected | late | failed
    eta = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["courier", "status"])]
