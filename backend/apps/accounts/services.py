import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

import pyotp
from django.conf import settings
from django.utils import timezone

from apps.platform.errors import ApiError
from apps.platform.notifications import notify_phone

from .models import OTPCode, Role, User

log = logging.getLogger(__name__)


def normalize_phone(raw):
    digits = "".join(c for c in str(raw) if c.isdigit())
    if len(digits) == 9:
        digits = "998" + digits
    if not (len(digits) == 12 and digits.startswith("998")):
        raise ApiError(400, "validation_error", "Telefon formati: +998XXXXXXXXX", field="phone")
    return "+" + digits


def _hash(phone, code):
    return hmac.new(settings.SECRET_KEY.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def request_otp(phone):
    phone = normalize_phone(phone)
    limit, window = settings.OTP_REQUEST_LIMIT
    since = timezone.now() - timedelta(seconds=window)
    if OTPCode.objects.filter(phone=phone, created_at__gte=since).count() >= limit:
        raise ApiError(429, "rate_limited")
    code = f"{secrets.randbelow(10**6):06d}"
    OTPCode.objects.create(phone=phone, code_hash=_hash(phone, code),
                           expires_at=timezone.now() + timedelta(seconds=settings.OTP_TTL_SECONDS))
    notify_phone(phone, f"DARIKO tasdiqlash kodi: {code}", template="otp")
    return phone


def verify_otp(phone, code):
    phone = normalize_phone(phone)
    otp = OTPCode.objects.filter(phone=phone, consumed=False).order_by("-created_at").first()
    if otp is None or otp.expires_at < timezone.now():
        raise ApiError(400, "otp_invalid")
    if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise ApiError(429, "otp_blocked")
    otp.attempts += 1
    if not hmac.compare_digest(otp.code_hash, _hash(phone, str(code))):
        otp.save(update_fields=["attempts"])
        raise ApiError(400, "otp_invalid")
    otp.consumed = True
    otp.save(update_fields=["consumed", "attempts"])
    user, created = User.objects.get_or_create(phone=phone)
    if created or not user.roles.filter(role=Role.CUSTOMER).exists():
        user.roles.get_or_create(role=Role.CUSTOMER, tenant=None, branch=None)
    return user


def staff_login(phone, password, mfa_code=None):
    phone = normalize_phone(phone)
    user = User.objects.filter(phone=phone, is_active=True).first()
    if not user or not user.has_usable_password() or not user.check_password(password or ""):
        raise ApiError(401, "bad_credentials")
    roles = set(user.roles.values_list("role", flat=True))
    must_mfa = bool(roles & set(settings.MFA_REQUIRED_ROLES))
    if user.mfa_confirmed:
        if not mfa_code:
            raise ApiError(401, "mfa_required")
        if not pyotp.TOTP(user.mfa_secret).verify(str(mfa_code), valid_window=1):
            raise ApiError(401, "bad_credentials")
    elif must_mfa:
        raise ApiError(403, "mfa_enrollment_required", enroll=True)
    return user


def mfa_begin(user):
    user.mfa_secret = pyotp.random_base32()
    user.mfa_confirmed = False
    user.save(update_fields=["mfa_secret", "mfa_confirmed"])
    return pyotp.TOTP(user.mfa_secret).provisioning_uri(name=user.phone, issuer_name="DARIKO")


def mfa_confirm(user, code):
    if not user.mfa_secret or not pyotp.TOTP(user.mfa_secret).verify(str(code), valid_window=1):
        raise ApiError(400, "otp_invalid")
    user.mfa_confirmed = True
    user.save(update_fields=["mfa_confirmed"])
