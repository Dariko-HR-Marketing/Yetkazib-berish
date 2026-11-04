from apps.delivery.models import Shipment, ShipmentStatus as SS
from apps.delivery.services import mask_phone, pin_for

STAGES = ["created", "pending_confirmation", "accepted", "preparing", "ready", "in_delivery", "completed"]


def item_dict(i):
    return {"id": str(i.id), "variant_id": str(i.variant_id), "name": i.name_snapshot, "unit_price": i.unit_price,
            "requested_qty": str(i.requested_qty), "actual_qty": None if i.actual_qty is None else str(i.actual_qty),
            "is_weighted": i.is_weighted, "modifiers": i.modifiers, "status": i.status, "line_total": i.line_total(),
            "substituted_by": str(i.substituted_by_id) if i.substituted_by_id else None,
            "proposed_price": i.proposed_price, "proposal_deadline": i.proposal_deadline, "serial_number": i.serial_number,
            "substitution_rule": i.substitution_rule}


def order_dict(o, audience="customer", with_items=True):
    d = {"id": str(o.id), "number": o.number, "status": o.status, "version": o.version, "branch_id": str(o.branch_id),
         "branch_name": o.branch.name, "payment_method": o.payment_method, "substitution_rule": o.substitution_rule,
         "subtotal": o.subtotal, "delivery_fee": o.delivery_fee, "discount": o.discount, "total": o.total,
         "final_total": o.final_total, "balance_due": o.balance_due, "approval_state": o.approval_state,
         "approval_deadline": o.approval_deadline, "estimated_ready_at": o.estimated_ready_at,
         "reserve_expires_at": o.reserve_expires_at, "channel": o.channel, "cancel_reason": o.cancel_reason,
         "created_at": o.created_at, "address": o.address, "comment": o.comment, "manual_reason": o.manual_reason,
         "slot_id": str(o.slot_id) if o.slot_id else None, "confirm_deadline": o.confirm_deadline}
    if audience == "customer":
        d["tracking_token"] = o.tracking_token
        if o.status == "in_delivery":
            sh = o.shipments.exclude(status__in=[SS.FAILED, SS.RETURNED]).order_by("-created_at").first()
            if sh:
                d["delivery_pin"] = pin_for(sh)
    else:
        d["customer_phone"] = o.customer_phone
        d["customer_name"] = o.customer_name
    if with_items:
        d["items"] = [item_dict(i) for i in o.items.all()]
    return d


def tracking_dict(o):
    sh = o.shipments.exclude(status__in=[SS.FAILED, SS.RETURNED]).select_related("courier").order_by("-created_at").first()
    cancelled = o.status == "cancelled"
    d = {"number": o.number, "status": o.status, "stages": [] if cancelled else STAGES, "total": o.total,
         "final_total": o.final_total, "eta": (sh.eta if sh and sh.eta else o.estimated_ready_at),
         "approval_state": o.approval_state, "cancel_reason": o.cancel_reason if cancelled else "",
         "branch": {"name": o.branch.name, "phone": o.branch.phone}, "payment_method": o.payment_method,
         "id": str(o.id), "items": [item_dict(i) for i in o.items.all()]}
    if sh and sh.courier and o.status == "in_delivery":
        d["courier"] = {"name": (sh.courier.full_name or "Kuryer").split(" ")[0], "phone": sh.courier.phone}
        d["delivery_pin"] = pin_for(sh)
    return d
