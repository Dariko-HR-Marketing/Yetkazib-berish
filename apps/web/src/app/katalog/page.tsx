"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton, Toast } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { formatQty, formatSom, parseQty, parseSom } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface StockView { quantity_milli: number; reserved_milli: number; available_milli: number; out_marked: boolean; state: "out" | "low" | "in" }
interface Product {
  id: string; category_id: string | null; name_uz: string; name_ru: string | null; sku: string | null; barcode: string | null; mxik: string | null;
  unit: "piece" | "kg" | "l"; price_tiyin: number; status: "active" | "hidden" | "archived"; stock: StockView;
}
interface Page { items: Product[]; next_cursor: string | null }
interface Summary { products: number; mxik_missing: number; out: number; low: number; last_import_at: string | null }
interface Branch { id: string; name: string }
interface Category { id: string; name_uz: string; name_ru: string | null }
type Filter = "all" | "low" | "out" | "mxik";

const CATALOG_READ = new Set(["owner", "manager", "accountant", "marketer"]);
const CATALOG_WRITE = new Set(["owner", "manager"]);
const STOCK_WRITE = new Set(["owner", "manager", "picker"]);
const TONE = { in: "ok", low: "warning", out: "danger" } as const;

interface Form { id: string | null; name_uz: string; name_ru: string; price: string; unit: Product["unit"]; sku: string; barcode: string; mxik: string; category_id: string; status: "active" | "hidden"; qty: string }
const EMPTY: Form = { id: null, name_uz: "", name_ru: "", price: "", unit: "piece", sku: "", barcode: "", mxik: "", category_id: "", status: "active", qty: "" };

export default function CatalogPage() {
  const { t, locale, money } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const role = membership?.role ?? "";
  const canRead = CATALOG_READ.has(role);
  const canWrite = CATALOG_WRITE.has(role);
  const canStock = STOCK_WRITE.has(role);

  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchId, setBranchId] = useState("");
  const [cats, setCats] = useState<Category[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<Product[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formErr, setFormErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [newBranch, setNewBranch] = useState({ name: "", address: "" });
  const reqId = useRef(0);

  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);
  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.code === "auth.mfa_required") { router.replace("/xavfsizlik"); return; }
    setToast({ msg: errText(e), tone: "danger" });
  }, [errText, router]);

  useEffect(() => { const id = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(id); }, [q]);

  // filiallar va kategoriyalar
  const loadBase = useCallback(async () => {
    try {
      const b = (await api<{ items: Branch[] }>("/v1/branches", { tenant: true })).items;
      setBranches(b);
      setBranchId((cur) => (cur && b.some((x) => x.id === cur) ? cur : b[0]?.id ?? ""));
      if (canRead) setCats((await api<{ items: Category[] }>("/v1/categories", { tenant: true })).items);
    } catch (e) { setError(errText(e)); setBranches([]); }
  }, [canRead, errText]);
  useEffect(() => { if (ready && membership) void loadBase(); else if (ready && !membership) router.replace("/dokon-yaratish"); }, [ready, membership, loadBase, router]);

  const listPath = canRead ? "/v1/products" : "/v1/stock";
  const query = useCallback((cur?: string | null) => {
    const p = new URLSearchParams({ limit: "30" });
    if (branchId) p.set("branch_id", branchId);
    if (qDebounced) p.set("q", qDebounced);
    if (filter === "low" || filter === "out") p.set("stock", filter);
    if (filter === "mxik") p.set("mxik", "missing");
    if (cur) p.set("cursor", cur);
    return `${listPath}?${p}`;
  }, [branchId, qDebounced, filter, listPath]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const [page, sum] = await Promise.all([
        api<Page>(query(), { tenant: true }),
        canRead ? api<Summary>(`/v1/catalog/summary${branchId ? `?branch_id=${branchId}` : ""}`, { tenant: true }) : Promise.resolve(null),
      ]);
      if (id !== reqId.current) return; // eskirgan javob
      setItems(page.items); setCursor(page.next_cursor); setSummary(sum); setQty({});
    } catch (e) {
      if (id !== reqId.current) return;
      if (e instanceof ApiError && e.code === "auth.mfa_required") { router.replace("/xavfsizlik"); return; }
      setError(errText(e));
    } finally { if (id === reqId.current) setLoading(false); }
  }, [query, canRead, branchId, errText, router]);
  useEffect(() => { if (ready && membership && branches && branches.length > 0 && branchId) void load(); else if (branches && branches.length === 0) setLoading(false); }, [ready, membership, branches, branchId, load]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try { const page = await api<Page>(query(cursor), { tenant: true }); setItems((x) => [...x, ...page.items]); setCursor(page.next_cursor); } catch (e) { fail(e); } finally { setMore(false); }
  };

  const createBranch = async () => {
    setBusy(true);
    try { await api("/v1/branches", { method: "POST", tenant: true, body: { name: newBranch.name.trim(), address: newBranch.address.trim() } }); await loadBase(); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const openForm = (p?: Product) => {
    setFormErr({});
    setForm(p ? { id: p.id, name_uz: p.name_uz, name_ru: p.name_ru ?? "", price: formatSom(p.price_tiyin), unit: p.unit, sku: p.sku ?? "", barcode: p.barcode ?? "", mxik: p.mxik ?? "", category_id: p.category_id ?? "", status: p.status === "hidden" ? "hidden" : "active", qty: "" } : { ...EMPTY });
    setTimeout(() => document.getElementById("pf-name")?.focus(), 0);
  };

  const save = async () => {
    if (!form) return;
    const err: Record<string, string> = {};
    const price = parseSom(form.price);
    if (price === null) err.price = t("product.price_invalid");
    const qtyMilli = form.qty.trim() === "" ? null : parseQty(form.qty);
    if (form.qty.trim() !== "" && qtyMilli === null) err.qty = t("product.qty_invalid");
    if (form.name_uz.trim().length < 1) err.name = t("validation.failed");
    setFormErr(err);
    if (Object.keys(err).length) return;
    const body = {
      name_uz: form.name_uz.trim(), name_ru: form.name_ru.trim() || null, price_tiyin: price, unit: form.unit, sku: form.sku.trim() || null,
      barcode: form.barcode.replace(/\s/g, "") || null, mxik: form.mxik.replace(/\s/g, "") || null, category_id: form.category_id || null, status: form.status,
    };
    setBusy(true);
    try {
      const saved = await api<Product>(form.id ? `/v1/products/${form.id}` : "/v1/products", { method: form.id ? "PATCH" : "POST", tenant: true, body });
      if (!form.id && qtyMilli !== null && qtyMilli > 0 && branchId) await api(`/v1/products/${saved.id}/stock`, { method: "PUT", tenant: true, body: { branch_id: branchId, quantity_milli: qtyMilli } });
      setForm(null); setToast({ msg: t("catalog.saved"), tone: "ok" }); await load();
    } catch (e) {
      if (e instanceof ApiError && e.code.startsWith("validation.")) {
        const issues = (e.details as { issues?: { path: string }[] }).issues ?? [];
        const m: Record<string, string> = {};
        for (const i of issues) m[i.path === "price_tiyin" ? "price" : i.path] = e.text(locale);
        if (e.code === "validation.barcode_invalid") m.barcode = e.text(locale);
        if (e.code === "validation.mxik_invalid") m.mxik = e.text(locale);
        setFormErr(m);
      } else if (e instanceof ApiError && e.code === "catalog.duplicate_barcode") setFormErr({ barcode: e.text(locale) });
      else if (e instanceof ApiError && e.code === "catalog.duplicate_sku") setFormErr({ sku: e.text(locale) });
      else fail(e);
    } finally { setBusy(false); }
  };

  const archive = async (p: Product) => {
    try { await api(`/v1/products/${p.id}`, { method: "DELETE", tenant: true }); setForm(null); setToast({ msg: t("catalog.archived"), tone: "ok" }); await load(); } catch (e) { fail(e); }
  };

  const saveQty = async (p: Product) => {
    const v = parseQty(qty[p.id] ?? "");
    if (v === null) { setToast({ msg: t("product.qty_invalid"), tone: "danger" }); return; }
    try {
      const s = await api<StockView>(`/v1/products/${p.id}/stock`, { method: "PUT", tenant: true, body: { branch_id: branchId, quantity_milli: v } });
      setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, stock: s } : x)));
      setQty((m) => { const { [p.id]: _drop, ...rest } = m; return rest; });
      setToast({ msg: t("catalog.stock_set"), tone: "ok" });
      if (canRead) setSummary(await api<Summary>(`/v1/catalog/summary?branch_id=${branchId}`, { tenant: true }));
    } catch (e) { fail(e); }
  };

  const toggleOut = async (p: Product) => {
    try {
      const s = await api<StockView>(`/v1/products/${p.id}/stock/out`, { method: "POST", tenant: true, body: { branch_id: branchId, out: !p.stock.out_marked } });
      setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, stock: s } : x)));
      if (canRead) setSummary(await api<Summary>(`/v1/catalog/summary?branch_id=${branchId}`, { tenant: true }));
      if (filter === "low" || filter === "out") await load(); // holat o'zgargach ro'yxat filtrga mos qayta tuziladi
    } catch (e) { fail(e); }
  };

  if (!ready || !membership || branches === null) return <PageSkeleton />;

  const filters: { key: Filter; label: string; n?: number }[] = [
    { key: "all", label: t("catalog.filter_all") },
    { key: "low", label: t("catalog.filter_low"), n: summary?.low },
    { key: "out", label: t("catalog.filter_out"), n: summary?.out },
    ...(canRead ? [{ key: "mxik" as const, label: t("catalog.filter_mxik"), n: summary?.mxik_missing }] : []),
  ];
  const catName = (c: Category) => (locale === "ru" && c.name_ru ? c.name_ru : c.name_uz);
  const prodName = (p: Product) => (locale === "ru" && p.name_ru ? p.name_ru : p.name_uz);

  return (
    <Shell role={role} title={t("catalog.title")} subtitle={t("catalog.subtitle")} tenantName={membership.tenant_name}
      actions={canWrite && branches.length > 0 && <Button onClick={() => openForm()}>{t("catalog.add")}</Button>}>
      {branches.length === 0 ? (
        <Card className="mx-auto flex max-w-md flex-col gap-4">
          <h2 className="text-title-sm font-extrabold">{t("catalog.no_branch_title")}</h2>
          <p className="text-body text-muted">{t("catalog.no_branch_hint")}</p>
          {role === "owner" ? (
            <>
              <Input id="br-name" label={t("branch.name")} value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} />
              <Input id="br-addr" label={t("branch.address")} value={newBranch.address} onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })} />
              <Button loading={busy} disabled={newBranch.name.trim().length < 2 || newBranch.address.trim().length < 3} onClick={createBranch}>{t("branch.create")}</Button>
            </>
          ) : <p className="text-body font-semibold">{t("catalog.no_branch_staff")}</p>}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {canRead && (
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[[t("catalog.stat_products"), summary?.products], [t("catalog.stat_low"), summary?.low], [t("catalog.stat_out"), summary?.out], [t("catalog.stat_mxik"), summary?.mxik_missing]].map(([label, n]) => (
                <Card key={String(label)} className="p-3"><dt className="text-body-sm text-muted">{label}</dt><dd className="text-title font-extrabold">{n ?? "…"}</dd></Card>
              ))}
            </dl>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-56"><Input id="cat-q" label={t("catalog.search")} type="search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {branches.length > 1 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="cat-branch" className="text-body font-semibold">{t("catalog.branch")}</label>
                <select id="cat-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg">
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            {canWrite && <Link href="/import" className="inline-flex min-h-touch items-center font-bold">{t("catalog.import_link")} →</Link>}
          </div>

          <div role="group" aria-label={t("catalog.title")} className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            {filters.map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
                className={`inline-flex min-h-touch shrink-0 items-center gap-1 rounded-full border px-4 text-body font-bold ${filter === f.key ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2"}`}>
                {f.label}{f.n !== undefined && f.key !== "all" && <span className="opacity-80">· {f.n}</span>}
              </button>
            ))}
          </div>

          {form && (
            <Card className="flex flex-col gap-4" role="region" aria-label={form.id ? t("product.form_edit") : t("product.form_new")}>
              <h2 className="text-title-sm font-extrabold">{form.id ? t("product.form_edit") : t("product.form_new")}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Input id="pf-name" label={t("product.name_uz")} value={form.name_uz} error={formErr.name} onChange={(e) => setForm({ ...form, name_uz: e.target.value })} />
                <Input id="pf-name-ru" label={t("product.name_ru")} value={form.name_ru} lang="ru" onChange={(e) => setForm({ ...form, name_ru: e.target.value })} />
                <Input id="pf-price" label={t("product.price")} inputMode="decimal" value={form.price} error={formErr.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                <div className="flex flex-col gap-1">
                  <label htmlFor="pf-unit" className="text-body font-semibold">{t("product.unit")}</label>
                  <select id="pf-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Form["unit"] })} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg">
                    {(["piece", "kg", "l"] as const).map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}
                  </select>
                </div>
                <Input id="pf-sku" label={t("product.sku")} value={form.sku} error={formErr.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                <Input id="pf-barcode" label={t("product.barcode")} inputMode="numeric" value={form.barcode} error={formErr.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                <Input id="pf-mxik" label={t("product.mxik")} inputMode="numeric" value={form.mxik} error={formErr.mxik} onChange={(e) => setForm({ ...form, mxik: e.target.value })} />
                <div className="flex flex-col gap-1">
                  <label htmlFor="pf-cat" className="text-body font-semibold">{t("product.category")}</label>
                  <select id="pf-cat" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg">
                    <option value="">{t("product.no_category")}</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{catName(c)}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="pf-status" className="text-body font-semibold">{t("product.status")}</label>
                  <select id="pf-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg">
                    <option value="active">{t("status.active")}</option><option value="hidden">{t("status.hidden")}</option>
                  </select>
                </div>
                {!form.id && <Input id="pf-qty" label={t("product.qty")} inputMode="decimal" value={form.qty} error={formErr.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button loading={busy} onClick={save}>{t("ui.save")}</Button>
                <Button variant="ghost" onClick={() => setForm(null)}>{t("product.cancel")}</Button>
                {form.id && <Button variant="ghost" onClick={() => { const p = items.find((x) => x.id === form.id); if (p) void archive(p); }}>{t("catalog.archive")}</Button>}
              </div>
            </Card>
          )}

          {loading && items.length === 0 ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
            : error ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
            : items.length === 0 ? <EmptyState title={filter !== "all" || qDebounced ? t("catalog.empty_filter") : t("catalog.empty")} hint={filter === "all" && !qDebounced ? t("catalog.empty_hint") : undefined} />
            : (
              <ul className="flex flex-col gap-3" aria-busy={loading}>
                {items.map((p) => {
                  const dirty = qty[p.id] !== undefined;
                  return (
                    <li key={p.id}>
                      <Card className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:gap-4 md:p-4" data-testid="product-row">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-body-lg font-bold">{prodName(p)} {p.status === "hidden" && <Badge tone="neutral">{t("catalog.hidden")}</Badge>}</p>
                          <p className="break-words text-body-sm text-muted">{[p.sku, p.barcode, t(`unit.${p.unit}`)].filter(Boolean).join(" · ")}</p>
                          <p className="text-body font-semibold">{money(p.price_tiyin)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm md:w-72">
                          <Badge tone={TONE[p.stock.state]}>{t(`catalog.state_${p.stock.state}`)}</Badge>
                          <span>{t("catalog.col_stock")}: <b>{formatQty(p.stock.quantity_milli)}</b></span>
                          <span>{t("catalog.col_reserved")}: <b>{formatQty(p.stock.reserved_milli)}</b></span>
                          <span>{t("catalog.col_avail")}: <b>{formatQty(p.stock.available_milli)}</b></span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {canStock && (
                            <>
                              <input aria-label={`${t("catalog.col_stock")}: ${prodName(p)}`} inputMode="decimal" value={qty[p.id] ?? formatQty(p.stock.quantity_milli)}
                                onChange={(e) => setQty({ ...qty, [p.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && dirty) void saveQty(p); }}
                                className="min-h-touch w-24 rounded-md border border-line-strong bg-surface px-2 text-body" />
                              {dirty && <Button onClick={() => saveQty(p)}>{t("ui.save")}</Button>}
                              <Button variant="ghost" onClick={() => toggleOut(p)}>{p.stock.out_marked ? t("catalog.back_on_sale") : t("catalog.mark_out")}</Button>
                            </>
                          )}
                          {canWrite && <Button variant="ghost" onClick={() => openForm(p)}>{t("catalog.edit")}</Button>}
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          {cursor && !error && <Button variant="ghost" loading={more} onClick={loadMore}>{t("catalog.load_more")}</Button>}
        </div>
      )}
      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </Shell>
  );
}
