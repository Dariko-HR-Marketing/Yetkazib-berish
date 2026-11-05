import uuid

from django.db import models


class Ticket(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="tickets")
    order_item = models.ForeignKey("orders.OrderItem", null=True, blank=True, on_delete=models.SET_NULL)
    type = models.CharField(max_length=20)                         # damaged | missing | late | other
    message = models.TextField(blank=True, default="")
    attachments = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=12, default="open")       # open | in_progress | resolved
    assignee = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    first_response_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
