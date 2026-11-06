"use client";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "@dostavka/ui";
import { ApiError, api } from "@/lib/api";
import { formatSom, parseSom } from "@/lib/catalog";
import { useI18n } from "@/lib/i18n";

interface S { fee_tiyin: number; free_from_tiyin: number | null; min_order_tiyin: number }

/** Egasi uchun: yetkazish narxi, bepul yetkazish chegarasi va minimal buyurtma (so'mda kiritiladi, tiyinda saqlanadi). */
export function DeliverySettingsCard({ onToast }: { onToast: (msg: string, tone: "ok" | "danger") => void }) {
  const { t, locale } = useI18n();
  const [fee, setFee] = useState("");
  const [free, setFree] = useState("");
  const [min, setMin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ fee?: string; free?: string; min?: string }>({});

  useEffect(() => {
    api<S>("/v1/delivery/settings", { tenant: true }).then((s) => { setFee(formatSom(s.fee_tiyin)); setFree(s.free_from_tiyin === null ? "" : formatSom(s.free_from_tiyin)); setMin(formatSom(s.min_order_tiyin)); }).catch(() => undefined);
  }, []);

  const save = async () => {
    const f = parseSom(fee || "0"), m = parseSom(min || "0"), fr = free.trim() === "" ? null : parseSom(free);
    const e: typeof err = {};
    if (f === null) e.fee = t("product.price_invalid");
    if (m === null) e.min = t("product.price_invalid");
    if (fr === undefined || (free.trim() !== "" && fr === null)) e.free = t("product.price_invalid");
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api("/v1/delivery/settings", { method: "PUT", tenant: true, body: { fee_tiyin: f, free_from_tiyin: fr, min_order_tiyin: m } }); onToast(t("delivery.saved"), "ok"); }
    catch (x) { onToast(x instanceof ApiError ? x.text(locale) : t("ui.error_generic"), "danger"); } finally { setBusy(false); }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-title-sm font-extrabold">{t("delivery.settings")}</h2>
      <Input id="d-fee" label={t("delivery.fee")} inputMode="decimal" value={fee} error={err.fee} onChange={(e) => setFee(e.target.value)} />
      <Input id="d-free" label={t("delivery.free_from")} hint={t("delivery.optional")} inputMode="decimal" value={free} error={err.free} onChange={(e) => setFree(e.target.value)} />
      <Input id="d-min" label={t("delivery.min_order")} inputMode="decimal" value={min} error={err.min} onChange={(e) => setMin(e.target.value)} />
      <Button loading={busy} onClick={save}>{t("ui.save")}</Button>
    </Card>
  );
}
