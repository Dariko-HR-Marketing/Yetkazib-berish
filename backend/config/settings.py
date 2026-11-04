"""Django sozlamalari. Barcha qiymatlar muhit o'zgaruvchilaridan (deploy/.env.example)."""
import os
from pathlib import Path
from urllib.parse import urlparse, unquote

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BASE_DIR.parent


def env(name, default=None, cast=str):
    v = os.environ.get(name)
    if v is None or v == "":
        return default
    if cast is bool:
        return v.lower() in ("1", "true", "yes", "on")
    return cast(v)


APP_ENV = env("APP_ENV", "development")  # development | staging | production
DEBUG = APP_ENV == "development" and env("DEBUG", True, bool)
SECRET_KEY = env("JWT_SECRET", "dev-insecure-change-me-" + "x" * 24)
if APP_ENV == "production" and SECRET_KEY.startswith("dev-insecure"):
    raise RuntimeError("Production uchun JWT_SECRET o'rnating")
ALLOWED_HOSTS = env("ALLOWED_HOSTS", "*").split(",")
CSRF_TRUSTED_ORIGINS = [o for o in env("CSRF_TRUSTED_ORIGINS", "").split(",") if o]

INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "rest_framework",
    "apps.platform.apps.PlatformConfig", "apps.accounts", "apps.tenants", "apps.catalog",
    "apps.orders", "apps.payments.apps.PaymentsConfig", "apps.delivery", "apps.support",
]

MIDDLEWARE = [
    "apps.platform.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [], "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages"]},
}]
WSGI_APPLICATION = "config.wsgi.application"


def _db():
    url = env("DATABASE_URL", "postgresql://dariko:dariko@localhost:5432/dariko")
    u = urlparse(url)
    return {
        "ENGINE": "django.db.backends.postgresql", "NAME": u.path.lstrip("/"),
        "USER": unquote(u.username or ""), "PASSWORD": unquote(u.password or ""),
        "HOST": u.hostname or "localhost", "PORT": u.port or 5432,
        "CONN_MAX_AGE": 60, "ATOMIC_REQUESTS": False,
    }


DATABASES = {"default": _db()}
AUTH_USER_MODEL = "accounts.User"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "uz"
TIME_ZONE = env("TIME_ZONE", "Asia/Tashkent")
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_ROOT = Path(env("MEDIA_ROOT", str(BASE_DIR / "media")))
MEDIA_URL = "/media/"
FRONTEND_DIR = Path(env("FRONTEND_DIR", str(REPO_DIR / "frontend")))
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.auth.BearerAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser", "rest_framework.parsers.MultiPartParser",
                               "rest_framework.parsers.FormParser"],
    "EXCEPTION_HANDLER": "apps.platform.errors.exception_handler",
    "UNAUTHENTICATED_USER": None,
    "URL_FORMAT_OVERRIDE": None,
}

# --- Xavfsizlik (NFR-06..09) ---
if APP_ENV != "development":
    SECURE_SSL_REDIRECT = env("SECURE_SSL_REDIRECT", True, bool)
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_HSTS_SECONDS = 31536000
    SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True

# --- Biznes sozlamalari (deploy/.env.example) ---
OTP_TTL_SECONDS = env("OTP_TTL_SECONDS", 300, int)
OTP_MAX_ATTEMPTS = 5
OTP_REQUEST_LIMIT = (5, 600)             # 10 daqiqada 5 ta so'rov
TRACKING_TOKEN_TTL_HOURS = env("TRACKING_TOKEN_TTL_HOURS", 24, int)
IDEMPOTENCY_TTL_HOURS = env("IDEMPOTENCY_TTL_HOURS", 24, int)
RESERVE_TTL_MINUTES = env("RESERVE_TTL_MINUTES", 15, int)
SUBSTITUTION_REPLY_TIMEOUT_SEC = env("SUBSTITUTION_REPLY_TIMEOUT_SEC", 300, int)
CONSENT_INCREASE_PCT_DEFAULT = env("CONSENT_INCREASE_PCT_DEFAULT", 10, int)
OUTBOX_MAX_ATTEMPTS = env("OUTBOX_MAX_ATTEMPTS", 10, int)
POS_STALE_SEC = env("POS_STALE_SEC", 900, int)
NO_RECIPIENT_WAIT_MIN = env("NO_RECIPIENT_WAIT_MIN", 10, int)
PIN_MAX_ATTEMPTS = 5
PAYMENT_PENDING_CHECK_MIN = env("PAYMENT_PENDING_CHECK_MIN", 5, int)
STAFF_TOKEN_TTL_HOURS = 12
CUSTOMER_TOKEN_TTL_HOURS = 24 * 7
# Rol bo'yicha qaytarish limiti (tiyin). Undan oshsa moliya tasdig'i kerak (FR-CS / FR-FIN).
SUPPORT_REFUND_LIMIT = env("SUPPORT_REFUND_LIMIT", 10_000_000, int)
MFA_REQUIRED_ROLES = ("platform_admin", "finance")

PAYMENT_PROVIDER = env("PAYMENT_PROVIDER", "mock")   # mock | payme | click  (G1 da tanlanadi)
PAYMENT_WEBHOOK_SECRET = env("PAYMENT_WEBHOOK_SECRET", "dev-webhook-secret")
MESSAGE_PROVIDER = env("MESSAGE_PROVIDER", "console")  # console | sms | telegram
SMS_PROVIDER_URL = env("SMS_PROVIDER_URL", "")
SMS_PROVIDER_LOGIN = env("SMS_PROVIDER_LOGIN", "")
SMS_PROVIDER_PASSWORD = env("SMS_PROVIDER_PASSWORD", "")
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_WEBHOOK_SECRET = env("TELEGRAM_WEBHOOK_SECRET", "")
STOREFRONT_BASE_URL = env("STOREFRONT_BASE_URL", env("APP_BASE_URL", "http://localhost:8000"))
SENTRY_DSN = env("SENTRY_DSN", "")

LOGGING = {
    "version": 1, "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "apps.platform.middleware.RequestIdFilter"},
                "mask": {"()": "apps.platform.middleware.PhoneMaskFilter"}},
    "formatters": {"std": {"format": "%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "std",
                             "filters": ["request_id", "mask"]}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "info").upper()},
}
