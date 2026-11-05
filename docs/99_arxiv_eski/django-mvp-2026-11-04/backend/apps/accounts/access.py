from django.http import Http404

from apps.platform.services import audit

from .auth import Scope


def in_scope_or_404(request, obj, *roles, tenant_only=False):
    """AC-04: boshqa hamkor obyekti uchun 404 + auditda qayd."""
    sc = Scope(request.user)
    ok = sc.can_tenant(obj.tenant_id, *roles) if tenant_only else sc.can_branch(obj.branch, *roles)
    if not ok:
        audit(obj.__class__.__name__.lower(), obj.pk, "access_denied", tenant_id=obj.tenant_id,
              actor=request.user, request=request)
        raise Http404
    return sc
