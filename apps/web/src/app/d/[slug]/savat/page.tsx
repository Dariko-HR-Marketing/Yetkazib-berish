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
  const [cashOk, setCashOk] = useState(true);
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const [short, setShort] = useState<Record<string, number>>({});

  useEffect(() => { api<{ name: string; features: { cash: boolean } }>(`/v1/shops/${slug}`, { auth: false }).then((s) => { setShopName(s.name); setCashOk(s.features.cash); }).catch(() => undefined); }, [slug]);

  const signedIn = Boolean(session?.signedIn);
  const total = cartTotal(cart);
  const nameOf = (p: { name_uz: string; name_ru: string | null }) => (locale === "ru" && p.name_ru ? p.name_ru : p.name_uz);
  const addressOk = fulfillment === "pickup" || address.trim().length >= 5;

  const goLogin = useCallback(() => router.push(`/kirish?next=${encodeURIComponent(`/d/${slug}/savat`)}`), [router, slug]);

  const place = useCallback(async () => {
    if (!cart.branch_id) return;
    setBusy(true); setShort({});
    try {
      const body = { branch_id: cart.branch_id, fulfillment, ...(fulfillment === "delivery" ? { delivery_address: address.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}), items: cart.lines.map((l) => ({ product_id: l.id, quantity_milli: l.quantity_milli })) };
      const o = await api<{ id: string }>(`/v1/shops/${slug}/orders`, { method: "POST", body });
      clearCart(slug);
      router.replace(`/d/${slug}/buyurtma/${o.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "order.out_of_stock") {
        setShort(Object.fromEntries(((e.details.items as { product_id: string; available_milli: number }[]) ?? []).map((i) => [i.product_id, i.available_milli])));
        setToast({ msg: t("cart.stock_changed"), tone: "danger" });
      } else if (e instanceof ApiError && e.code === "order.product_unavailable") setToast({ msg: t("cart.unavailable"), tone: "danger" });
      else setToast({ msg: e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic"), tone: "danger" });
    } finally { setBusy(false); }
  }, [cart, fulfillment, address, note, slug, router, t, locale]);

  const canPlace = cart.lines.length > 0 && addressOk && cashOk;

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
            {fulfillment === "delivery" && <Input id="addr" label={t("cart.address")} hint={t("cart.address_hint")} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" maxLength={300} />}
            <Input id="note" label={t("cart.note")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            <p className="text-body-sm text-muted">{cashOk ? t("cart.payment") : t("cart.cash_off")}</p>
            <dl className="flex flex-col gap-1 border-t border-line-soft pt-3 text-body">
              <div className="flex justify-between"><dt>{t("cart.subtotal")}</dt><dd>{money(total)}</dd></div>
              <div className="flex justify-between"><dt>{t("cart.delivery_fee")}</dt><dd>{t("cart.free")}</dd></div>
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
