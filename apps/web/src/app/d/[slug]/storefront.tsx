"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton } from "@dostavka/ui";
import { ShopShell, unitLabel } from "@/components/shop-shell";
import { ApiError, NetworkError, api } from "@/lib/api";
import { cartTotal, changeQty, setBranch, stepOf, useCart } from "@/lib/cart";
import { formatQty } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { MainAction } from "@/lib/telegram";

export interface ShopData { slug: string; name: string; branches: { id: string; name: string; address: string }[]; features: { cash: boolean; stock_visible: boolean } }
export interface CategoryItem { id: string; name_uz: string; name_ru: string | null }
export interface ShopProduct { id: string; category_id: string | null; name_uz: string; name_ru: string | null; unit: "piece" | "kg" | "l"; price_tiyin: number; availability: { state: "in" | "low" | "out"; available_milli: number | null } }
export interface ProductPage { branch_id: string | null; items: ShopProduct[]; next_cursor: string | null }

export function Storefront({ slug, shop, categories, initial }: { slug: string; shop: ShopData; categories: CategoryItem[]; initial: ProductPage }) {
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const cart = useCart(slug);
  const [branchId, setBranchId] = useState(initial.branch_id ?? shop.branches[0]?.id ?? "");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);
  const [tick, setTick] = useState(0);

  useEffect(() => { const id = setTimeout(() => setQd(q.trim()), 300); return () => clearTimeout(id); }, [q]);
  useEffect(() => { if (branchId) setBranch(slug, branchId); }, [slug, branchId]);

  const url = useCallback((cur?: string | null) => {
    const p = new URLSearchParams({ limit: "30" });
    if (branchId) p.set("branch_id", branchId);
    if (cat) p.set("category_id", cat);
    if (qd) p.set("q", qd);
    if (cur) p.set("cursor", cur);
    return `/v1/shops/${slug}/products?${p}`;
  }, [slug, branchId, cat, qd]);

  useEffect(() => {
    if (first.current) { first.current = false; if (!cat && !qd && branchId === (initial.branch_id ?? shop.branches[0]?.id ?? "")) return; }
    let alive = true;
    setLoading(true); setError(null);
    api<ProductPage>(url(), { auth: false }).then((r) => { if (alive) { setItems(r.items); setCursor(r.next_cursor); } })
      .catch((e) => { if (alive) setError(e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [url, tick]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try { const r = await api<ProductPage>(url(cursor), { auth: false }); setItems((x) => [...x, ...r.items]); setCursor(r.next_cursor); } catch { /* qayta urinish mumkin */ } finally { setMore(false); }
  };

  const nameOf = (p: { name_uz: string; name_ru: string | null }) => (locale === "ru" && p.name_ru ? p.name_ru : p.name_uz);
  const total = cartTotal(cart);
  const goCart = useCallback(() => router.push(`/d/${slug}/savat`), [router, slug]);

  return (
    <ShopShell slug={slug} name={shop.name}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-56"><Input id="shop-q" label={t("shop.search")} type="search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {shop.branches.length > 1 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="shop-branch" className="text-body font-semibold">{t("shop.branch")}</label>
              <select id="shop-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg">
                {shop.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {categories.length > 0 && (
          <div role="group" aria-label={t("shop.all")} className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            {[{ id: "", name_uz: t("shop.all"), name_ru: t("shop.all") }, ...categories].map((c) => (
              <button key={c.id || "all"} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}
                className={`inline-flex min-h-touch shrink-0 items-center rounded-full border px-4 text-body font-bold ${cat === c.id ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2"}`}>{c.id ? nameOf(c) : c.name_uz}</button>
            ))}
          </div>
        )}

        {loading && items.length === 0 ? <div className="grid gap-3 sm:grid-cols-2" aria-busy="true"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
          : error ? <ErrorState message={error} onRetry={() => setTick((n) => n + 1)} retryLabel={t("ui.retry")} />
          : items.length === 0 ? <EmptyState title={t("shop.empty")} />
          : (
            <ul className="grid gap-3 sm:grid-cols-2" aria-busy={loading}>
              {items.map((p) => {
                const line = cart.lines.find((l) => l.id === p.id);
                const out = p.availability.state === "out";
                const step = stepOf(p.unit);
                const max = p.availability.available_milli;
                const canPlus = !out && (max === null || (line?.quantity_milli ?? 0) + step <= max);
                const base = { id: p.id, name_uz: p.name_uz, name_ru: p.name_ru, unit: p.unit, price_tiyin: p.price_tiyin };
                return (
                  <li key={p.id}>
                    <Card className="flex h-full flex-col gap-2 p-3" data-testid="shop-product">
                      <div className="flex items-start justify-between gap-2">
                        <p className="break-words text-body-lg font-bold">{nameOf(p)}</p>
                        {out ? <Badge tone="danger">{t("shop.out")}</Badge> : p.availability.state === "low" ? <Badge tone="warning">{t("shop.low")}</Badge> : null}
                      </div>
                      <p className="text-body font-semibold">{money(p.price_tiyin)} <span className="font-normal text-muted">/ {unitLabel(t, p.unit)}</span></p>
                      {max !== null && !out && p.availability.state === "low" && <p className="text-body-sm text-muted">{t("shop.left", { qty: formatQty(max), unit: unitLabel(t, p.unit) })}</p>}
                      <div className="mt-auto pt-1">
                        {line ? (
                          <div className="flex items-center gap-2" role="group" aria-label={nameOf(p)}>
                            <Button variant="ghost" aria-label={t("shop.minus")} onClick={() => changeQty(slug, base, -step)}>−</Button>
                            <span className="min-w-16 text-center text-body-lg font-bold" aria-live="polite">{formatQty(line.quantity_milli)} {unitLabel(t, p.unit)}</span>
                            <Button variant="ghost" aria-label={t("shop.plus")} disabled={!canPlus} onClick={() => changeQty(slug, base, step)}>+</Button>
                          </div>
                        ) : <Button disabled={out} onClick={() => changeQty(slug, base, step)}>{out ? t("shop.out") : t("shop.add")}</Button>}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        {cursor && !error && <Button variant="ghost" loading={more} onClick={loadMore}>{t("shop.more")}</Button>}
        <p className="sr-only">{shop.branches.map((b) => `${b.name}: ${b.address}`).join("; ")}</p>
      </div>

      {cart.lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface p-3" style={{ paddingBottom: "calc(12px + var(--safe-bottom, 0px))" }}>
          <div className="mx-auto max-w-[960px]">
            <MainAction text={t("shop.cart_bar", { total: money(total) })} onClick={goCart}>{t("shop.cart_bar", { total: money(total) })}</MainAction>
          </div>
        </div>
      )}
      <Link href={`/d/${slug}/savat`} className="sr-only">{t("shop.cart")}</Link>
    </ShopShell>
  );
}
