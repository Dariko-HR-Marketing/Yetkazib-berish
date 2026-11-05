from rest_framework.response import Response
from rest_framework.views import APIView

from . import services


class PaymentWebhook(APIView):
    authentication_classes = []

    def post(self, request, provider):
        res = services.handle_webhook(provider, request.body, request.headers.get("X-Signature", ""))
        return Response(res)
