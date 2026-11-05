"""Token autentifikatsiya (imzolangan, muddati cheklangan) va rol/doira tekshiruvlari (NFR-07/08)."""
from django.conf import settings
from django.core import signing
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from apps.platform.errors import ApiError

from .models import Role, User

SALT = "dariko.auth.v1"


def issue_token(user, ttl_hours):
    return signing.dumps({"u": str(user.id), "e": user.token_epoch, "h": ttl_hours}, salt=SALT)


def read_token(token):
    # max_age eng ko'pi bilan mijoz muddati; aniq muddat 'h' bilan tekshiriladi
    data = signing.loads(token, salt=SALT, max_age=settings.CUSTOMER_TOKEN_TTL_HOURS * 3600)
    return data


class BearerAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        try:
            data = read_token(header[7:])
            max_age = data.get("h", 1) * 3600
            signing.loads(header[7:], salt=SALT, max_age=max_age)
            user = User.objects.get(id=data["u"], is_active=True)
        except (signing.BadSignature, User.DoesNotExist):
            raise AuthenticationFailed("invalid token")
        if user.token_epoch != data["e"]:
            raise AuthenticationFailed("revoked")
        return (user, None)

    def authenticate_header(self, request):
        return "Bearer"


class Scope:
    """Foydalanuvchi rollari bo'yicha ruxsat doirasi."""

    def __init__(self, user):
        self.user = user
        self.roles = list(user.roles.select_related("branch"))

    def has(self, *roles):
        return any(r.role in roles for r in self.roles)

    @property
    def is_admin(self):
        return self.has(Role.PLATFORM_ADMIN)

    def tenant_ids(self, *roles):
        return {r.tenant_id for r in self.roles if r.tenant_id and (not roles or r.role in roles)}

    def branch_ids_for(self, *roles):
        """Rol tenant darajasida bo'lsa — tenantning barcha filiallari, aks holda biriktirilgan filiallar."""
        from apps.tenants.models import Branch
        ids = set()
        for r in self.roles:
            if roles and r.role not in roles:
                continue
            if r.branch_id:
                ids.add(r.branch_id)
            elif r.tenant_id:
                ids.update(Branch.objects.filter(tenant_id=r.tenant_id).values_list("id", flat=True))
        return ids

    def can_branch(self, branch, *roles):
        if self.is_admin:
            return True
        return branch.id in self.branch_ids_for(*roles)

    def can_tenant(self, tenant_id, *roles):
        return self.is_admin or tenant_id in self.tenant_ids(*roles)


def require_staff(request, *roles):
    """roles bo'sh bo'lmasa, shulardan biri kerak. platform_admin hamma joyda ruxsat."""
    if not request.user:
        raise AuthenticationFailed("auth required")
    sc = Scope(request.user)
    if not (sc.is_admin or sc.has(*roles)):
        raise ApiError(403, "forbidden")
    return sc
