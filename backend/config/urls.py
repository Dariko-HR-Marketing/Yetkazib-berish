from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve as _serve

from apps.accounts import views as acc
from apps.catalog import views as cat
from apps.delivery import views as dlv
from apps.orders import views as ords
from apps.payments import views as pay
from apps.platform import views as plat
from apps.support import views as sup
from apps.tenants import views as ten

api = [
    path("health", plat.Health.as_view()),
    # Auth
    path("auth/otp/request", acc.OtpRequest.as_view()),
    path("auth/otp/verify", acc.OtpVerify.as_view()),
    path("auth/staff/login", acc.StaffLogin.as_view()),
    path("auth/mfa/setup", acc.MfaSetup.as_view()),
    path("auth/mfa/confirm", acc.MfaConfirm.as_view()),
    path("me", acc.Me.as_view()),
    path("me/addresses", acc.Addresses.as_view()),
    path("me/orders", ords.MyOrders.as_view()),
    path("uploads", plat.Upload.as_view()),
    # Vitrina
    path("storefront/<slug:slug>", ords.TenantInfo.as_view()),
    path("storefront/<slug:slug>/zones/resolve", ords.ZoneResolve.as_view()),
    path("storefront/<slug:slug>/branches/<uuid:branch_id>/catalog", ords.Catalog.as_view()),
    path("storefront/<slug:slug>/branches/<uuid:branch_id>/slots", ords.Slots.as_view()),
    path("storefront/<slug:slug>/cart/quote", ords.CartQuote.as_view()),
    # Buyurtma
    path("orders", ords.OrderCreate.as_view()),
    path("orders/<uuid:order_id>", ords.OrderDetail.as_view()),
    path("orders/<uuid:order_id>/cancel", ords.OrderCancel.as_view()),
    path("orders/<uuid:order_id>/approve-changes", ords.OrderApproveChanges.as_view()),
    path("orders/<uuid:order_id>/payments", ords.OrderPayment.as_view()),
    path("orders/<uuid:order_id>/reorder", ords.Reorder.as_view()),
    path("tracking/<str:token>", ords.Tracking.as_view()),
    path("tracking/<str:token>/<str:action>", ords.TrackingAction.as_view()),
    # Hamkor
    path("partner/tenant", ten.PartnerTenant.as_view()),
    path("partner/tenants/<uuid:branch_id>/branches", ten.PartnerBranchCreate.as_view()),
    path("partner/branches/<uuid:branch_id>", ten.PartnerBranch.as_view()),
    path("partner/branches/<uuid:branch_id>/orders", ords.PartnerOrders.as_view()),
    path("partner/branches/<uuid:branch_id>/zones", ten.PartnerZones.as_view()),
    path("partner/branches/<uuid:branch_id>/slots/generate", ten.SlotGenerate.as_view()),
    path("partner/branches/<uuid:branch_id>/stock", cat.StockUpdate.as_view()),
    path("partner/zones/<uuid:zone_id>", ten.PartnerZoneDetail.as_view()),
    path("partner/staff", ten.PartnerStaff.as_view()),
    path("partner/orders/<uuid:order_id>", ords.PartnerOrderDetail.as_view()),
    path("partner/orders/<uuid:order_id>/transition", ords.PartnerTransition.as_view()),
    path("partner/categories", cat.Categories.as_view()),
    path("partner/products", cat.Products.as_view()),
    path("partner/products/<uuid:product_id>", cat.ProductDetail.as_view()),
    path("partner/catalog/import", cat.CatalogImport.as_view()),
    path("partner/catalog/export", cat.CatalogExport.as_view()),
    path("partner/reports", sup.Reports.as_view()),
    # Yig'ish / oshxona
    path("picking/branches/<uuid:branch_id>/queue", ords.PickingQueue.as_view()),
    path("picking/orders/<uuid:order_id>/items/<uuid:item_id>", ords.PickItem.as_view()),
    path("picking/orders/<uuid:order_id>/barcode", ords.PickByBarcode.as_view()),
    path("picking/orders/<uuid:order_id>/prep-time", ords.PrepTime.as_view()),
    # Yetkazish
    path("delivery/shipments", dlv.DispatchShipments.as_view()),
    path("delivery/couriers", dlv.Couriers.as_view()),
    path("delivery/shipments/<uuid:shipment_id>/assign", dlv.Assign.as_view()),
    path("delivery/shipments/<uuid:shipment_id>/resolve", dlv.Resolve.as_view()),
    path("courier/shipments", dlv.CourierShipments.as_view()),
    path("courier/shipments/<uuid:shipment_id>", dlv.CourierShipment.as_view()),
    path("delivery/shipments/<uuid:shipment_id>/status", dlv.ShipmentAction.as_view()),
    # Yordam / moliya
    path("support/tickets", sup.Tickets.as_view()),
    path("support/tickets/<uuid:ticket_id>", sup.TicketDetail.as_view()),
    path("support/orders/<uuid:order_id>/refunds", sup.OrderRefund.as_view()),
    path("finance/refunds", sup.FinanceRefunds.as_view()),
    path("finance/refunds/<uuid:refund_id>/approve", sup.FinanceRefundApprove.as_view()),
    path("finance/reconciliation", sup.Reconciliation.as_view()),
    path("ops/attention", sup.AttentionQueue.as_view()),
    # Platforma
    path("platform/tenants", ten.PlatformTenants.as_view()),
    # Webhooklar
    path("webhooks/payments/<str:provider>", pay.PaymentWebhook.as_view()),
    path("webhooks/telegram", plat.TelegramWebhook.as_view()),
]

def serve(request, path, document_root=None, **kw):
    if path == "" or path.endswith("/"):
        path += "index.html"
    return _serve(request, path, document_root=document_root, **kw)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api)),
    re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
    # Statik frontend (vitrina va panel). Production'da Nginx/CDN orqali beriladi.
    re_path(r"^(?P<path>.*)$", serve, {"document_root": settings.FRONTEND_DIR}),
]
