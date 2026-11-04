"""Atomar zaxira operatsiyalari (AC-02). Barcha o'zgarishlar bitta UPDATE ... WHERE bilan."""
from decimal import Decimal

from django.db.models import F, Q
from django.db.models.functions import Greatest

from apps.catalog.models import BranchStock
from apps.tenants.models import TimeSlot


def reserve(branch_id, variant_id, qty):
    """Oxirgi SKU uchun raqobatda faqat bittasi muvaffaqiyatli bo'ladi."""
    qty = Decimal(qty)
    n = (BranchStock.objects
         .filter(branch_id=branch_id, variant_id=variant_id, is_stopped=False,
                 available_qty__gte=F("reserved_qty") + qty)
         .filter(Q(online_quota__isnull=True) | Q(online_quota__gte=F("reserved_qty") + qty))
         .update(reserved_qty=F("reserved_qty") + qty))
    return n == 1


def release(branch_id, variant_id, qty):
    BranchStock.objects.filter(branch_id=branch_id, variant_id=variant_id).update(
        reserved_qty=Greatest(F("reserved_qty") - Decimal(qty), Decimal(0)))


def commit(branch_id, variant_id, reserved_qty, actual_qty):
    """Yig'ishdan keyin: qoldiqdan haqiqiy miqdor, rezervdan band qilingan miqdor ayriladi."""
    BranchStock.objects.filter(branch_id=branch_id, variant_id=variant_id).update(
        reserved_qty=Greatest(F("reserved_qty") - Decimal(reserved_qty), Decimal(0)),
        available_qty=Greatest(F("available_qty") - Decimal(actual_qty), F("reserved_qty") - Decimal(reserved_qty), Decimal(0)),
    )


def restock(branch_id, variant_id, qty):
    BranchStock.objects.filter(branch_id=branch_id, variant_id=variant_id).update(
        available_qty=F("available_qty") + Decimal(qty))


def book_slot(slot_id):
    return TimeSlot.objects.filter(id=slot_id, booked__lt=F("capacity")).update(booked=F("booked") + 1) == 1


def free_slot(slot_id):
    TimeSlot.objects.filter(id=slot_id, booked__gt=0).update(booked=F("booked") - 1)
