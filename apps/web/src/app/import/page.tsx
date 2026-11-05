"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Toast } from "@dostavka/ui";
import { ApiError, NetworkError, api } from "@/lib/api";
import { csvCell, fileToBase64 } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/use-session";
import { PageSkeleton, Shell } from "@/components/shell";

interface RowError { row: number; code: string; field?: string; params?: Record<string, string | number> }
interface Result {
  mode: "preview" | "apply"; job_id: string | null; total_rows: number; created: number; updated: number; unchanged: number; errors: RowError[];
  skipped_price_jumps: number; price_jumps: { row: number }[]; ignored_columns: string[]; duration_ms: number;
}
interface Job { id: string; format: string; total_rows: number; created_count: number; updated_count: number; error_count: number; created_at: string }
interface Branch { id: string; name: string }

const MAX_BYTES = 8 * 1024 * 1024;
const TEMPLATE = "nomi,nomi_ru,artikul,shtrix-kod,mxik,narx,birlik,qoldiq,kategoriya\nSut 3.2%,Молоко 3.2%,MILK-32,4780000000001,,12500,l,22,Sut mahsulotlari\n";

export default function ImportPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { me, ready, session } = useRequireSession();
  const membership = me?.memberships.find((m) => m.tenant_id === session?.tenantId);
  const role = membership?.role ?? "";
  const allowed = role === "owner" || role === "manager";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [history, setHistory] = useState<Job[] | null>(null);
  const [file, setFile] = useState<{ name: string; format: "csv" | "xlsx"; b64: string } | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [confirmJumps, setConfirmJumps] = useState(false);
  const [busy, setBusy] = useState<"read" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "danger" } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const errText = useCallback((e: unknown) => (e instanceof ApiError ? e.text(locale) : e instanceof NetworkError ? t("ui.error_network") : t("ui.error_generic")), [locale, t]);

  const loadHistory = useCallback(async () => {
    try { setHistory((await api<{ items: Job[] }>("/v1/catalog/imports?limit=10", { tenant: true })).items); } catch (e) { setError(errText(e)); setHistory([]); }
  }, [errText]);

  useEffect(() => {
    if (!ready) return;
    if (!membership) { router.replace("/dokon-yaratish"); return; }
    if (!allowed) { router.replace("/katalog"); return; }
    void loadHistory();
    api<{ items: Branch[] }>("/v1/branches", { tenant: true }).then((r) => { setBranches(r.items); setBranchId(r.items[0]?.id ?? ""); }).catch(() => undefined);
  }, [ready, membership, allowed, loadHistory, router]);

  const run = useCallback(async (f: NonNullable<typeof file>, mode: "preview" | "apply", branch: string, jumps: boolean) => {
    setBusy(mode === "apply" ? "apply" : "read"); setError(null);
    try {
      const body: Record<string, unknown> = { format: f.format, content_base64: f.b64, mode, confirm_price_jumps: jumps };
      if (branch) body.branch_id = branch;
      const r = await api<Result>("/v1/catalog/imports", { method: "POST", tenant: true, body });
      if (mode === "preview") setPreview(r); else { setDone(r); setPreview(null); setFile(null); await loadHistory(); }
    } catch (e) { setPreview(null); setError(errText(e)); } finally { setBusy(null); }
  }, [errText, loadHistory]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setDone(null); setPreview(null); setConfirmJumps(false); setError(null);
    const lower = f.name.toLowerCase();
    const format = lower.endsWith(".xlsx") ? "xlsx" : lower.endsWith(".csv") ? "csv" : null;
    if (!format) { setError(t("import.invalid_file")); return; }
    if (f.size > MAX_BYTES) { setError(t("import.file_too_large")); return; }
    const next = { name: f.name, format, b64: await fileToBase64(f) } as const;
    setFile({ ...next });
    await run({ ...next }, "preview", branchId, false);
  };

  const errorMessage = (e: RowError) => {
    const key = `import.err.${e.code}`;
    const msg = t(key, Object.fromEntries(Object.entries(e.params ?? {}).map(([k, v]) => [k, v])) as Record<string, string | number>);
    return msg === key ? e.code : msg;
  };

  const downloadErrors = (errors: RowError[]) => {
    const lines = ["row,field,error", ...errors.map((e) => [e.row, e.field ?? "", errorMessage(e)].map(csvCell).join(","))];
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "import-xatolar.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "katalog-shablon.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (!ready || !membership || !allowed) return <PageSkeleton />;

  const changes = preview ? preview.created + preview.updated : 0;
  const jumps = preview?.skipped_price_jumps ?? 0;

  return (
    <Shell role={role} title={t("import.title")} subtitle={t("import.subtitle")} tenantName={membership.tenant_name}>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <input ref={input} id="import-file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
              <Button onClick={() => input.current?.click()} loading={busy === "read"}>{t("import.choose")}</Button>
              <Button variant="ghost" onClick={downloadTemplate}>{t("import.template")}</Button>
              {file && <span className="break-all text-body font-semibold">{file.name}</span>}
            </div>
            {branches.length > 1 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="imp-branch" className="text-body font-semibold">{t("import.branch")}</label>
                <select id="imp-branch" value={branchId} onChange={(e) => { setBranchId(e.target.value); if (file) void run(file, "preview", e.target.value, false); }} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg">
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            {busy === "read" && <p role="status" className="text-body text-muted">{t("import.reading")}</p>}
            {error && <ErrorState message={error} retryLabel={t("ui.retry")} onRetry={() => setError(null)} />}
          </Card>

          {preview && (
            <Card className="flex flex-col gap-4" role="region" aria-label={t("import.title")}>
              <p className="text-body text-muted">{t("import.preview_note")}</p>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="import-summary">
                {[[t("import.sum_created"), preview.created, "ok"], [t("import.sum_updated"), preview.updated, "info"], [t("import.sum_unchanged"), preview.unchanged, "neutral"], [t("import.sum_errors"), preview.errors.length, preview.errors.length ? "danger" : "neutral"]].map(([label, n, tone]) => (
                  <div key={String(label)} className="rounded-md border border-line p-3"><dt className="text-body-sm text-muted">{label}</dt><dd className="text-title font-extrabold"><Badge tone={tone as "ok"}>{n}</Badge></dd></div>
                ))}
              </dl>
              {preview.ignored_columns.length > 0 && <p className="text-body-sm text-muted">{t("import.ignored", { cols: preview.ignored_columns.join(", ") })}</p>}

              {preview.errors.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="text-title-sm font-extrabold">{t("import.errors_title")}</h2>
                  <div className="max-h-72 overflow-auto rounded-md border border-line">
                    <table className="w-full text-left text-body">
                      <thead className="sticky top-0 bg-bg text-caption uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">{t("import.col_row")}</th><th className="px-3 py-2">{t("import.col_error")}</th></tr></thead>
                      <tbody>{preview.errors.slice(0, 200).map((e, i) => <tr key={i} className="border-t border-line-soft"><td className="px-3 py-2 font-semibold">{e.row}</td><td className="px-3 py-2">{errorMessage(e)}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <Button variant="ghost" onClick={() => downloadErrors(preview.errors)}>{t("import.errors_file")}</Button>
                </div>
              )}

              {jumps > 0 && (
                <label className="flex min-h-touch items-center gap-3 text-body font-semibold">
                  <input type="checkbox" className="h-6 w-6" checked={confirmJumps} onChange={(e) => setConfirmJumps(e.target.checked)} />
                  {t("import.confirm_jumps", { count: jumps })}
                </label>
              )}
              {changes === 0 && jumps === 0 ? <p className="text-body font-semibold">{t("import.nothing")}</p> : null}
              <div className="flex flex-wrap gap-3">
                <Button loading={busy === "apply"} disabled={changes === 0 && !(confirmJumps && jumps > 0)} onClick={() => file && run(file, "apply", branchId, confirmJumps)}>{t("import.apply")}</Button>
                <Button variant="ghost" onClick={() => { setPreview(null); setFile(null); input.current?.click(); }}>{t("import.cancel")}</Button>
              </div>
            </Card>
          )}

          {done && (
            <Card className="flex flex-col gap-3" role="status">
              <p className="text-title-sm font-extrabold">{t("import.done", { created: done.created, updated: done.updated })}</p>
              {done.errors.length > 0 && <Button variant="ghost" onClick={() => downloadErrors(done.errors)}>{t("import.errors_file")} ({done.errors.length})</Button>}
              <Link href="/katalog" className="inline-flex min-h-touch items-center font-bold">{t("import.to_catalog")} →</Link>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <h2 className="mb-3 text-title-sm font-extrabold">{t("import.history")}</h2>
          {history === null ? <div className="flex flex-col gap-2" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            : history.length === 0 ? <EmptyState title={t("import.history_empty")} />
            : (
              <ul className="flex flex-col divide-y divide-line-soft">
                {history.map((j) => (
                  <li key={j.id} className="flex flex-col gap-1 py-3 text-body-sm">
                    <span className="font-semibold">{new Date(j.created_at).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "short" })} · {j.format.toUpperCase()}</span>
                    <span className="text-muted">{t("import.done", { created: j.created_count, updated: j.updated_count })}{j.error_count > 0 ? ` · ⚠ ${j.error_count}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>
      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </Shell>
  );
}
