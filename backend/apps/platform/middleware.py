"""X-Request-Id (NFR-10) va loglarda telefon niqoblash."""
import contextvars
import logging
import re
import uuid

request_id_var = contextvars.ContextVar("request_id", default="-")
_PHONE = re.compile(r"\+?998(\d{2})\d{4}(\d{3})")


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:16]
        request.request_id = rid
        token = request_id_var.set(rid)
        try:
            response = self.get_response(request)
        finally:
            request_id_var.reset(token)
        response["X-Request-Id"] = rid
        return response


class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_var.get()
        return True


class PhoneMaskFilter(logging.Filter):
    def filter(self, record):
        try:
            msg = record.getMessage()
            record.msg, record.args = _PHONE.sub(r"+998\1****\2", msg), ()
        except Exception:  # pragma: no cover
            pass
        return True
