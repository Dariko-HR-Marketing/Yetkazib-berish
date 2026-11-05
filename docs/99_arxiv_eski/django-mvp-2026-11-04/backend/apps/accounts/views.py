from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.platform.errors import ApiError
from apps.platform.services import audit

from . import services
from .auth import Scope, issue_token
from .models import CustomerAddress, User


def _need(data, *names):
    out = []
    for n in names:
        v = data.get(n)
        if v in (None, ""):
            raise ApiError(400, "validation_error", f"'{n}' majburiy", field=n)
        out.append(v)
    return out


def user_payload(user):
    sc = Scope(user)
    return {"id": str(user.id), "phone": user.phone, "full_name": user.full_name, "locale": user.locale,
            "mfa_enabled": user.mfa_confirmed,
            "roles": [{"role": r.role, "tenant_id": str(r.tenant_id) if r.tenant_id else None,
                       "branch_id": str(r.branch_id) if r.branch_id else None} for r in sc.roles]}


class OtpRequest(APIView):
    authentication_classes = []

    def post(self, request):
        (phone,) = _need(request.data, "phone")
        services.request_otp(phone)
        return Response(status=204)


class OtpVerify(APIView):
    authentication_classes = []

    def post(self, request):
        phone, code = _need(request.data, "phone", "code")
        user = services.verify_otp(phone, code)
        return Response({"access_token": issue_token(user, settings.CUSTOMER_TOKEN_TTL_HOURS),
                         "user": user_payload(user)})


class StaffLogin(APIView):
    authentication_classes = []

    def post(self, request):
        phone, password = _need(request.data, "phone", "password")
        user = services.staff_login(phone, password, request.data.get("mfa_code"))
        audit("user", user.id, "staff_login", actor=user, request=request)
        return Response({"access_token": issue_token(user, settings.STAFF_TOKEN_TTL_HOURS),
                         "user": user_payload(user)})


class MfaSetup(APIView):
    """Parol bilan tasdiqlab MFA ni boshlash (MFA hali yoqilmagan xodim uchun ham)."""
    authentication_classes = []

    def post(self, request):
        phone, password = _need(request.data, "phone", "password")
        user = User.objects.filter(phone=services.normalize_phone(phone), is_active=True).first()
        if not user or not user.check_password(password):
            raise ApiError(401, "bad_credentials")
        if user.mfa_confirmed:
            raise ApiError(409, "forbidden", "MFA allaqachon yoqilgan")
        return Response({"otpauth_uri": services.mfa_begin(user), "secret": user.mfa_secret})


class MfaConfirm(APIView):
    authentication_classes = []

    def post(self, request):
        phone, password, code = _need(request.data, "phone", "password", "code")
        user = User.objects.filter(phone=services.normalize_phone(phone), is_active=True).first()
        if not user or not user.check_password(password):
            raise ApiError(401, "bad_credentials")
        services.mfa_confirm(user, code)
        audit("user", user.id, "mfa_enabled", actor=user, request=request)
        return Response(status=204)


class Me(APIView):
    def get(self, request):
        if not request.user:
            raise AuthenticationFailed("auth")
        return Response(user_payload(request.user))

    def patch(self, request):
        if not request.user:
            raise AuthenticationFailed("auth")
        for f in ("full_name", "locale"):
            if f in request.data:
                setattr(request.user, f, str(request.data[f])[:120])
        request.user.save()
        return Response(user_payload(request.user))


class Addresses(APIView):
    def get(self, request):
        if not request.user:
            raise AuthenticationFailed("auth")
        return Response([{"id": str(a.id), "label": a.label, "address_text": a.address_text, "landmark": a.landmark,
                          "entrance": a.entrance, "floor": a.floor, "apartment": a.apartment, "lat": a.lat, "lng": a.lng}
                         for a in request.user.addresses.order_by("-created_at")])

    def post(self, request):
        if not request.user:
            raise AuthenticationFailed("auth")
        d = request.data
        text, lat, lng = _need(d, "address_text", "lat", "lng")
        a = CustomerAddress.objects.create(
            user=request.user, address_text=text, lat=float(lat), lng=float(lng),
            **{k: str(d.get(k, ""))[:200] for k in ("label", "landmark", "entrance", "floor", "apartment")})
        return Response({"id": str(a.id)}, status=201)
