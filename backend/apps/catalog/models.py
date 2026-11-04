import uuid

from django.db import models


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL)
    name = models.JSONField()                                  # {"uz":"..","ru":".."}
    sort_order = models.IntegerField(default=0)


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    name = models.JSONField()
    description = models.JSONField(null=True, blank=True)
    unit = models.CharField(max_length=10, default="pcs")      # pcs | kg | l
    is_weighted = models.BooleanField(default=False)
    is_fragile = models.BooleanField(default=False)
    requires_serial = models.BooleanField(default=False)
    images = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [models.Index(fields=["tenant", "category"])]


class Variant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    sku = models.CharField(max_length=64)
    barcode = models.CharField(max_length=64, blank=True, default="", db_index=True)
    attributes = models.JSONField(default=dict, blank=True)    # rang, o'lcham, porsiya
    weight_g = models.IntegerField(null=True, blank=True)
    volume_cm3 = models.IntegerField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["tenant", "sku"], name="uniq_tenant_sku")]


class Modifier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="modifiers")
    name = models.JSONField()
    price = models.BigIntegerField(default=0)
    max_qty = models.IntegerField(default=1)


class BranchStock(models.Model):
    id = models.BigAutoField(primary_key=True)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    branch = models.ForeignKey("tenants.Branch", on_delete=models.CASCADE, related_name="stock")
    variant = models.ForeignKey(Variant, on_delete=models.CASCADE, related_name="stock")
    price = models.BigIntegerField()                           # tiyinda
    cost = models.BigIntegerField(default=0)                   # tannarx (hisobot uchun)
    available_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    reserved_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    online_quota = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    is_stopped = models.BooleanField(default=False)            # stop-list
    source = models.CharField(max_length=10, default="manual")  # manual | csv | pos
    synced_at = models.DateTimeField(auto_now=False, auto_now_add=False, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["branch", "variant"], name="uniq_branch_variant"),
            models.CheckConstraint(condition=models.Q(reserved_qty__gte=0, reserved_qty__lte=models.F("available_qty")),
                                   name="stock_reserved_within_available"),
        ]
