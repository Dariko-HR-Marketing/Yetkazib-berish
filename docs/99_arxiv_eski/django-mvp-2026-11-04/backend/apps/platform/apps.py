from django.apps import AppConfig


class PlatformConfig(AppConfig):
    name = "apps.platform"
    label = "platform_core"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import notifications  # noqa: F401  (handlerlarni ro'yxatdan o'tkazish)
