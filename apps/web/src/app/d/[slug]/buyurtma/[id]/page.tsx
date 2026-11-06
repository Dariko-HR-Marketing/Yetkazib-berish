"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorState, Skeleton, Toast } from "@dostavka/ui";
import { ShopShell, unitLabel } from "@/components/shop-shell";
import { ApiError, NetworkError, api } from "@/lib/api";
import { formatQty } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { getSession } from "@/lib/session";

interface Item { id: string; name_uz: string; name_ru: string | null; unit: string; quantity_milli: number; line_total_tiyin: number }
interface Ord { id: string; number: number; status: string; fulfillment: string; total_tiyin: number; delivery_address: string | null; note: string | null; cancel_reason: string | null; items: Item[] }
const TONE: Record<string, "info" | "ok" | "danger" | "warning"> = { placed: "info", accepted: "warning", picking: "warning", ready: "info", delivering: "warning", completed: "ok", cancelled: "danger", failed: "danger" };

export default function OrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = use(params);
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const [o, setO] = useState<Ord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);

  const load = useCallback(() => api<Ord>(`/v1/shops/${slug}/orders/${id}`).then((r) => { setO(r); setError(null); }).catch((e) => setError(errText(e))), [slug, id, errText]);
  useEffect(() => {
    if (!getSession()?.signedIn) { router.replace(`/kirish?next=${encodeURIComponent(`/d/${slug}/buyurtma/${id}`)}`); return; }
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10000); // holat o'zgarishi
    return () => clearInterval(timer);
  }, [slug, id, router, load]);

  const cancel = async () => {
    setBusy(true);
    try { setO(await api<Ord>(`/v1/shops/${slug}/orders/${id}/cancel`, { method: "POST", body: {} })); setToast(t("order.cancelled_ok")); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  const nameOf = (p: Item) => (locale === "ru" && p.name_ru ? p.name_ru : p.name_uz);

  return (
    <ShopShell slug={slug} name={slug} back>
      {error && !o ? <ErrorState message={error} retryLabel={t("ui.retry")} onRetry={() => void load()} />
        : !o ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-40" /></div>
        : (
          <div className="mx-auto flex max-w-xl flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-title font-extrabold">{t("order.title", { number: o.number })}</h1>
              <Badge tone={TONE[o.status] ?? "neutral"}>{t(`order.status_${o.status}`)}</Badge>
            </div>
            {o.status === "placed" && <p role="status" className="text-body text-muted">{t("order.shop_wait")}</p>}
            {o.status === "cancelled" && o.cancel_reason && <p className="text-body text-muted">{t("order.reason")}: {o.cancel_reason}</p>}
            <Card className="flex flex-col gap-2">
              <h2 className="text-title-sm font-extrabold">{t("order.items")}</h2>
              <ul className="flex flex-col gap-1">{o.items.map((i) => <li key={i.id} className="flex justify-between gap-3 text-body"><span className="break-words">{nameOf(i)} × {formatQty(i.quantity_milli)} {unitLabel(t, i.unit)}</span><span className="font-semibold">{money(i.line_total_tiyin)}</span></li>)}</ul>
              <p className="flex justify-between border-t border-line-soft pt-2 text-title-sm font-extrabold"><span>{t("cart.total")}</span><span data-testid="order-total">{money(o.total_tiyin)}</span></p>
            </Card>
            <Card className="flex flex-col gap-1 text-body">
              <p><b>{o.fulfillment === "delivery" ? t("order.address") : t("order.pickup")}</b>{o.delivery_address ? `: ${o.delivery_address}` : ""}</p>
              {o.note && <p><b>{t("order.note")}</b>: {o.note}</p>}
              <p className="text-muted">{t("cart.payment")}</p>
            </Card>
            {o.status === "placed" && <Button variant="ghost" loading={busy} onClick={cancel}>{t("order.cancel")}</Button>}
          </div>
        )}
      {toast && <Toast message={toast} tone="ok" onClose={() => setToast(null)} />}
    </ShopShell>
  );
}
