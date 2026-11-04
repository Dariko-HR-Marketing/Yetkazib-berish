from django.contrib import admin
from django.apps import apps as django_apps

from .models import AuditLog


@admin.register(AuditLog)
class AuditAdmin(admin.ModelAdmin):
    list_display = ("created_at", "entity", "action", "actor_id", "tenant_id")
    search_fields = ("entity_id", "action", "request_id")

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request):
        return False


# Qolgan modellar — ichki admin (FR-ADM): hamkor ulash, rollar, murojaatlar va h.k.
for app_label in ("accounts", "tenants", "catalog", "orders", "payments", "delivery", "support", "platform_core"):
    for model in django_apps.get_app_config(app_label).get_models():
        if model is AuditLog or admin.site.is_registered(model):
            continue
        try:
            admin.site.register(model)
        except admin.sites.AlreadyRegistered:
            pass
