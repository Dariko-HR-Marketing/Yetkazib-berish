"use client";
import { useEffect, useState } from "react";
import { Button, Card, Switch } from "@dostavka/ui";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Day = (typeof DAYS)[number];
type Slot = { open: string; close: string } | null;
type Hours = Partial<Record<Day, Slot>>;
interface Branch { id: string; name: string; work_hours: Hours }
type Draft = { always: boolean; days: Record<Day, { on: boolean; open: string; close: string }> };

const toDraft = (h: Hours): Draft => ({
  always: Object.keys(h).length === 0,
  days: Object.fromEntries(DAYS.map((d) => { const s = h[d]; return [d, { on: s ? true : Object.keys(h).length === 0, open: s?.open ?? "09:00", close: s?.close ?? "21:00" }]; })) as Draft["days"],
});
const toHours = (d: Draft): Hours => (d.always ? {} : Object.fromEntries(DAYS.map((k) => [k, d.days[k].on ? { open: d.days[k].open, close: d.days[k].close } : null])));
const valid = (d: Draft) => d.always || DAYS.every((k) => !d.days[k].on || d.days[k].close === "24:00" || d.days[k].close > d.days[k].open);

/** Egasi uchun: har filialning haftalik ish vaqti (Asia/Tashkent). Jadval yo'q — doim ochiq; yopiq filialda buyurtma berib bo'lmaydi. */
export function WorkHoursCard({ onToast }: { onToast: (msg: string, tone: "ok" | "danger") => void }) {
  const { t, locale } = useI18n();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: Branch[] }>("/v1/branches", { tenant: true }).then((r) => { setBranches(r.items); setDrafts(Object.fromEntries(r.items.map((b) => [b.id, toDraft(b.work_hours ?? {})]))); }).catch(() => setBranches([]));
  }, []);
  if (!branches || branches.length === 0) return null;

  const patch = (id: string, fn: (d: Draft) => Draft) => setDrafts((all) => ({ ...all, [id]: fn(all[id]!) }));
  const save = async (b: Branch) => {
    const d = drafts[b.id]!;
    if (!valid(d)) { onToast(t("wh.invalid"), "danger"); return; }
    setBusy(b.id);
    try { await api(`/v1/branches/${b.id}`, { method: "PATCH", tenant: true, body: { work_hours: toHours(d) } }); onToast(t("wh.saved"), "ok"); }
    catch (x) { onToast(x instanceof ApiError ? x.text(locale) : t("ui.error_generic"), "danger"); } finally { setBusy(null); }
  };

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-title-sm font-extrabold">{t("wh.title")}</h2>
      {branches.map((b) => {
        const d = drafts[b.id]!;
        return (
          <section key={b.id} className="flex flex-col gap-2" aria-label={b.name} data-testid="wh-branch">
            <h3 className="text-body-lg font-bold">{b.name}</h3>
            <Switch checked={d.always} label={t("wh.always")} onChange={(v) => patch(b.id, (x) => ({ ...x, always: v }))} />
            {!d.always && (
              <ul className="flex flex-col gap-2">
                {DAYS.map((k) => (
                  <li key={k} className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[8.5rem]"><Switch checked={d.days[k].on} label={t(`wh.day_${k}`)} onChange={(v) => patch(b.id, (x) => ({ ...x, days: { ...x.days, [k]: { ...x.days[k], on: v } } }))} /></div>
                    {d.days[k].on ? (
                      <>
                        <input type="time" aria-label={`${t(`wh.day_${k}`)}: ${t("wh.open")}`} value={d.days[k].open} onChange={(e) => patch(b.id, (x) => ({ ...x, days: { ...x.days, [k]: { ...x.days[k], open: e.target.value } } }))} className="min-h-touch rounded-md border border-line-strong bg-surface px-2 text-body" />
                        <span aria-hidden="true">–</span>
                        <input type="time" aria-label={`${t(`wh.day_${k}`)}: ${t("wh.close")}`} value={d.days[k].close === "24:00" ? "23:59" : d.days[k].close} onChange={(e) => patch(b.id, (x) => ({ ...x, days: { ...x.days, [k]: { ...x.days[k], close: e.target.value === "23:59" ? "24:00" : e.target.value } } }))} className="min-h-touch rounded-md border border-line-strong bg-surface px-2 text-body" />
                      </>
                    ) : <span className="text-body-sm text-muted">{t("wh.day_off")}</span>}
                  </li>
                ))}
              </ul>
            )}
            <Button loading={busy === b.id} onClick={() => save(b)}>{t("ui.save")}</Button>
          </section>
        );
      })}
    </Card>
  );
}
