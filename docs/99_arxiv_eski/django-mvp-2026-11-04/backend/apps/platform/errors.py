import logging

from django.http import Http404
from rest_framework.exceptions import APIException, NotAuthenticated, AuthenticationFailed
from rest_framework.response import Response

from .messages import msg, lang_of

log = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status, code, message=None, **extra):
        self.status, self.code, self.message, self.extra = status, code, message, extra


def exception_handler(exc, context):
    request = context.get("request")
    lang = lang_of(request) if request is not None else "uz"
    rid = getattr(request, "request_id", None) if request is not None else None

    def body(code, message, status, **extra):
        err = {"code": code, "message": message, "request_id": rid, **extra}
        return Response({"error": err}, status=status)

    if isinstance(exc, ApiError):
        return body(exc.code, exc.message or msg(exc.code, lang), exc.status, **exc.extra)
    if isinstance(exc, Http404):
        return body("not_found", msg("not_found", lang), 404)
    if isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        return body("unauthorized", msg("unauthorized", lang), 401)
    if isinstance(exc, APIException):
        return body("validation_error" if exc.status_code == 400 else "error", str(exc.detail), exc.status_code)
    log.exception("Kutilmagan xato")
    return body("internal_error", "Internal error", 500)
