"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, Input, Toast } from "@dostavka/ui";
import { ShopShell, unitLabel } from "@/components/shop-shell";
import { ApiError, NetworkError, api } from "@/lib/api";
import { cartTotal, changeQty, clearCart, lineTotal, stepOf, useCart } from "@/lib/cart";
import { formatQty } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { useSessionValue } from "@/lib/use-session";
import { MainAction } from "@/lib/telegram";

export default function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const cart = useCart(slug);
  const session = useSessionValue();
  const [shopName, setShopName] = useState(slug);
  const [closedIds, setClosedIds] = useState<string[]>([]);
  const [cashOk, setCashOk] = useState(true);
  const [onlineOk, setOnlineOk] = useState(false);
  const [method, setMethod] = useState<"cash" | "online">("cash");
  const [delivery, setDelivery] = useState({ fee_tiyin: 0, free_from_tiyin: null as number | null, min_order_tiyin: 0 });
  const [loyal, setLoyal] = useState<{ enabled: boolean; spendable_points: number; pending_points: number; point_value_tiyin: number; max_pay_share_pct: number; hold_hours: number; tier: string; cashback_pct: number } | null>(null);
  const [points, setPoints] = useState("");
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [address, setAddress] = useState("");
  const [saved, setSaved] = useState<{ id: string; label: string; address: string; is_default: boolean }[]>([]);
  const [saveIt, setSaveIt] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const [short, setShort] = useState<Record<string, number>>({});

  useEffect(() => { api<{ name: string; branches?: { id: string; open_now: boolean }[]; features: { cash: boolean; online?: boolean }; delivery: { fee_tiyin: number; free_from_tiyin: number | null; min_order_tiyin: number } }>(`/v1/shops/${slug}`, { auth: false }).then((s) => { setClosedIds((s.branches ?? []).filter((b) => !b.open_now).map((b) => b.id)); setShopName(s.name); setCashOk(s.features.cash); setOnlineOk(Boolean(s.features.online)); if (!s.features.cash && s.features.online) setMethod("online"); setDelivery(s.delivery); }).catch(() => undefined); }, [slug]);

  const signedIn = Boolean(session?.signedIn);
  useEffect(() => { if (signedIn) api<NonNullable<typeof loyal>>(`/v1/shops/${slug}/loyalty`).then((l) => setLoyal(l.enabled ? l : null)).catch(() => setLoyal(null)); }, [signedIn, slug]);
  useEffect(() => {
    if (!signedIn) return;
    api<{ items: typeof saved }>(`/v1/shops/${slug}/addresses`).then((r) => { setSaved(r.items); const d = r.items.find((a) => a.is_default); if (d) setAddress((cur) => cur || d.address); }).catch(() => setSaved([]));
  }, [signedIn, slug]);
  const removeSaved = async (id: string) => { try { await api(`/v1/shops/${slug}/addresses/${id}`, { method: "DELETE" }); setSaved((s) => s.filter((a) => a.id !== id)); } catch { /* ro'yxat o'zgarmaydi */ } };
  const subtotal = cartTotal(cart);
  const fee = fulfillment === "delivery" && subtotal > 0 && !(delivery.free_from_tiyin !== null && subtotal >= delivery.free_from_tiyin) ? delivery.fee_tiyin : 0;
  const maxPoints = loyal ? Math.max(0, Math.min(loyal.spendable_points, Math.floor((subtotal * loyal.max_pay_share_pct) / 100 / loyal.point_value_tiyin))) : 0;
  const pointsNum = Math.min(maxPoints, Math.max(0, Math.floor(Number(points.replace(/\D/g, "")) || 0)));
  const discount = loyal ? pointsNum * loyal.point_value_tiyin : 0;
  const total = subtotal + fee - discount;
  const belowMin = subtotal < delivery.min_order_tiyin;
  const nameOf = (p: { name_uz: string; name_ru: string | null }) => (locale === "ru" && p.name_ru ? p.name_ru : p.name_uz);
  const addressOk = fulfillment === "pickup" || address.trim().length >= 5;

  const goLogin = useCallback(() => router.push(`/kirish?next=${encodeURIComponent(`/d/${slug}/savat`)}`), [router, slug]);

  const place = useCallback(async () => {
    if (!cart.branch_id) return;
    setBusy(true); setShort({});
    try {
      const body = { branch_id: cart.branch_id, fulfillment, payment_type: method, ...(fulfillment === "delivery" ? { delivery_address: address.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(pointsNum > 0 ? { points_to_use: pointsNum } : {}), items: cart.lines.map((l) => ({ product_id: l.id, quantity_milli: l.quantity_milli })) };
      const o = await api<{ id: string; payment: { pay_url: string | null } | null }>(`/v1/shops/${slug}/orders`, { method: "POST", body });
      if (fulfillment === "delivery" && saveIt && saved.length < 5 && !saved.some((a) => a.address.toLowerCase() === address.trim().toLowerCase())) {
        try { await api(`/v1/shops/${slug}/addresses`, { method: "POST", body: { label: address.trim().slice(0, 40), address: address.trim() } }); } catch { /* buyurtma muvaffaqiyatli: manzilni saqlash ixtiyoriy */ }
      }
      clearCart(slug);
      router.replace(o.payment?.pay_url ?? `/d/${slug}/buyurtma/${o.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "order.out_of_stock") {
        setShort(Object.fromEntries(((e.details.items as { product_id: string; available_milli: number }[]) ?? []).map((i) => [i.product_id, i.available_milli])));
        setToast({ msg: t("cart.stock_changed"), tone: "danger" });
      } else if (e instanceof ApiError && e.code === "order.product_unavailable") setToast({ msg: t("cart.unavailable"), tone: "danger" });
      else setToast({ msg: e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic"), tone: "danger" });
    } finally { setBusy(false); }
  }, [cart, fulfillment, address, note, slug, router, t, locale, method, pointsNum, saveIt, saved]);

  const branchClosed = Boolean(cart.branch_id && closedIds.includes(cart.branch_id));
  const canPlace = cart.lines.length > 0 && addressOk && (method === "online" ? onlineOk : cashOk) && !belowMin && !branchClosed;

  return (
    <ShopShell slug={slug} name={shopName} back>
      <h1 className="mb-4 text-title font-extrabold">{t("cart.title")}</h1>
      {cart.lines.length === 0 ? <EmptyState title={t("cart.empty")} action={<Link href={`/d/${slug}`} className="inline-flex min-h-touch items-center font-bold">{t("cart.back")}</Link>} /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <ul className="flex flex-col gap-3">
            {cart.lines.map((l) => {
              const base = { id: l.id, name_uz: l.name_uz, name_ru: l.name_ru, unit: l.unit, price_tiyin: l.price_tiyin };
              return (
                <li key={l.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3 p-3" data-testid="cart-line">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="break-words text-body-lg font-bold">{nameOf(l)}</p>
                      <p className="text-body-sm text-muted">{money(l.price_tiyin)} / {unitLabel(t, l.unit)}</p>
                      {short[l.id] !== undefined && <p role="alert" className="text-body-sm font-semibold text-danger">{t("shop.left", { qty: formatQty(short[l.id]!), unit: unitLabel(t, l.unit) })}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" aria-label={t("shop.minus")} onClick={() => changeQty(slug, base, -stepOf(l.unit))}>−</Button>
                      <span className="min-w-16 text-center text-body-lg font-bold">{formatQty(l.quantity_milli)} {unitLabel(t, l.unit)}</span>
                      <Button variant="ghost" aria-label={t("shop.plus")} onClick={() => changeQty(slug, base, stepOf(l.unit))}>+</Button>
                    </div>
                    <p className="w-full text-right text-body font-bold sm:w-auto">{money(lineTotal(l.quantity_milli, l.price_tiyin))}</p>
                  </Card>
                </li>
              );
            })}
          </ul>

          <Card className="flex h-fit flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-body font-semibold">{t("cart.fulfillment")}</legend>
              {(["delivery", "pickup"] as const).map((f) => (
                <label key={f} className="flex min-h-touch items-center gap-3 text-body">
                  <input type="radio" name="fulfillment" className="h-5 w-5 accent-[var(--c-brand)]" checked={fulfillment === f} onChange={() => setFulfillment(f)} />{t(`cart.${f}`)}
                </label>
              ))}
            </fieldset>
            {fulfillment === "delivery" && saved.length > 0 && (
              <div role="group" aria-label={t("addr.saved")} className="flex flex-col gap-2" data-testid="saved-addresses">
                <p className="text-body-sm text-muted">{t("addr.saved")}</p>
                <ul className="flex flex-wrap gap-2">
                  {saved.map((a) => (
                    <li key={a.id} className="flex items-center overflow-hidden rounded-full border border-line-strong bg-surface">
                      <button type="button" aria-pressed={address.trim().toLowerCase() === a.address.toLowerCase()} onClick={() => setAddress(a.address)} className="min-h-touch max-w-[14rem] truncate px-4 text-body font-semibold aria-pressed:bg-ink aria-pressed:text-bg">{a.label}</button>
                      <button type="button" aria-label={t("addr.remove", { label: a.label })} onClick={() => removeSaved(a.id)} className="inline-flex min-h-touch min-w-touch items-center justify-center text-muted">×</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fulfillment === "delivery" && <Input id="addr" label={t("cart.address")} hint={t("cart.address_hint")} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" maxLength={300} />}
            {fulfillment === "delivery" && saved.length < 5 && signedIn && (
              <label className="flex min-h-touch items-center gap-3 text-body"><input type="checkbox" checked={saveIt} onChange={(e) => setSaveIt(e.target.checked)} className="h-5 w-5" />{t("addr.remember")}</label>
            )}
            <Input id="note" label={t("cart.note")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            {branchClosed && <p role="alert" data-testid="branch-closed" className="text-body-sm font-semibold text-danger">{t("wh.cart_closed")}</p>}
            {belowMin && <p role="alert" className="text-body-sm font-semibold text-danger">{t("cart.min_order", { min: money(delivery.min_order_tiyin) })}</p>}
            {loyal && (
              <div className="flex flex-col gap-1 rounded-md border border-line p-3">
                <Input id="points" label={t("loyalty.use")} inputMode="numeric" value={points} hint={t("loyalty.use_hint", { max: maxPoints })} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))} />
                <p className="text-body-sm text-muted">{t("loyalty.balance", { points: loyal.spendable_points })}{loyal.pending_points > 0 ? ` · ${t("loyalty.pending", { points: loyal.pending_points, hours: loyal.hold_hours })}` : ""}</p>
                <p className="text-body-sm text-muted">{t("loyalty.tier", { tier: loyal.tier, pct: loyal.cashback_pct })}</p>
              </div>
            )}
            {onlineOk && cashOk ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-body font-semibold">{t("pay.method")}</legend>
                {(["cash", "online"] as const).map((m) => (
                  <label key={m} className="flex min-h-touch items-center gap-3 text-body"><input type="radio" name="pay" className="h-5 w-5 accent-[var(--c-brand)]" checked={method === m} onChange={() => setMethod(m)} />{t(`pay.${m}`)}</label>
                ))}
              </fieldset>
            ) : <p className="text-body-sm text-muted">{onlineOk && !cashOk ? t("pay.online") : cashOk ? t("cart.payment") : t("cart.cash_off")}</p>}
            <dl className="flex flex-col gap-1 border-t border-line-soft pt-3 text-body">
              <div className="flex justify-between"><dt>{t("cart.subtotal")}</dt><dd>{money(subtotal)}</dd></div>
              <div className="flex justify-between"><dt>{t("cart.delivery_fee")}</dt><dd>{fee === 0 ? t("cart.free") : money(fee)}</dd></div>
              {discount > 0 && <div className="flex justify-between"><dt>{t("loyalty.discount")}</dt><dd>−{money(discount)}</dd></div>}
              <div className="flex justify-between text-title-sm font-extrabold"><dt>{t("cart.total")}</dt><dd data-testid="cart-total">{money(total)}</dd></div>
            </dl>
            {signedIn
              ? <MainAction text={t("cart.place")} onClick={place} disabled={!canPlace} loading={busy}>{t("cart.place")}</MainAction>
              : <><p className="text-body font-semibold">{t("cart.login")}</p><MainAction text={t("cart.sign_in")} onClick={goLogin}>{t("cart.sign_in")}</MainAction></>}
          </Card>
        </div>
      )}
      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </ShopShell>
  );
}
