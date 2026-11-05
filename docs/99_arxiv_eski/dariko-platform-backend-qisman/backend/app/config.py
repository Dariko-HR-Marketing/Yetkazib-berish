"""Ilova sozlamalari. Barcha qiymatlar muhit o'zgaruvchilaridan o'qiladi (.env.example ga qarang)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, default))


@dataclass(frozen=True)
class Settings:
    app_env: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./dariko.db"))
    jwt_secret: str = field(default_factory=lambda: os.getenv("JWT_SECRET", "dev-only-secret-change-me"))
    public_base_url: str = field(default_factory=lambda: os.getenv("APP_BASE_URL", "http://localhost:8000"))

    access_token_minutes: int = field(default_factory=lambda: _int("ACCESS_TOKEN_MINUTES", 12 * 60))
    otp_ttl_seconds: int = field(default_factory=lambda: _int("OTP_TTL_SECONDS", 300))
    otp_max_attempts: int = field(default_factory=lambda: _int("OTP_MAX_ATTEMPTS", 5))
    tracking_token_hours: int = field(default_factory=lambda: _int("TRACKING_TOKEN_TTL_HOURS", 48))

    reserve_ttl_minutes: int = field(default_factory=lambda: _int("RESERVE_TTL_MINUTES", 15))
    substitution_reply_seconds: int = field(default_factory=lambda: _int("SUBSTITUTION_REPLY_TIMEOUT_SEC", 300))
    consent_increase_pct_default: int = field(default_factory=lambda: _int("CONSENT_INCREASE_PCT_DEFAULT", 10))
    outbox_max_attempts: int = field(default_factory=lambda: _int("OUTBOX_MAX_ATTEMPTS", 10))
    stock_stale_minutes: int = field(default_factory=lambda: _int("STOCK_STALE_MINUTES", 60))

    payment_provider: str = field(default_factory=lambda: os.getenv("PAYMENT_PROVIDER", "mock"))
    payment_webhook_secret: str = field(default_factory=lambda: os.getenv("PAYMENT_WEBHOOK_SECRET", "dev-webhook-secret"))
    message_provider: str = field(default_factory=lambda: os.getenv("MESSAGE_PROVIDER", "console"))
    telegram_bot_token: str = field(default_factory=lambda: os.getenv("TELEGRAM_BOT_TOKEN", ""))

    @property
    def is_dev(self) -> bool:
        return self.app_env in ("development", "test")


settings = Settings()
