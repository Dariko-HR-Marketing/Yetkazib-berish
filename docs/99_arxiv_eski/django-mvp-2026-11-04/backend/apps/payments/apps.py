from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    name = "apps.payments"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import services  # noqa: F401  (outbox handlerini ro'yxatdan o'tkazish)
