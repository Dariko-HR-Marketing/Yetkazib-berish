"use client";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "@dostavka/ui";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface S { provider: string | null; merchant_id: string | null; enabled: boolean; has_secret: boolean; available_providers: string[] }

/** Egasi uchun: onlayn to'lov provayderi va webhook kaliti (kalit faqat yoziladi, qaytmaydi). Pul do'konning merchant hisobiga to'g'ridan-to'g'ri tushadi. */
export function PaymentSettingsCard({ slug, onToast }: { slug: string; onToast: (msg: string, tone: "ok" | "danger") => void }) {
  const { t, locale } = useI18n();
  const [s, setS] = useState<S | null>(null);
  const [provider, setProvider] = useState("mock");
  const [merchant, setMerchant] = useState("");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<S>("/v1/payments/settings", { tenant: true }).then((x) => { setS(x); setProvider(x.provider ?? x.available_providers[0] ?? "mock"); setMerchant(x.merchant_id ?? ""); setEnabled(x.enabled); }).catch(() => undefined);
  }, []);
  if (!s) return null;

  const save = async () => {
    setBusy(true);
    try {
      const x = await api<S>("/v1/payments/settings", { method: "PUT", tenant: true, body: { provider, merchant_id: merchant.trim() || null, ...(secret ? { secret } : {}), enabled } });
      setS(x); setSecret(""); onToast(t("pay.saved"), "ok");
    } catch (e) { onToast(e instanceof ApiError ? e.text(locale) : t("ui.error_generic"), "danger"); } finally { setBusy(false); }
  };
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-title-sm font-extrabold">{t("pay.settings")}</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor="pay-provider" className="text-body font-semibold">{t("pay.provider")}</label>
        <select id="pay-provider" value={provider} onChange={(e) => setProvider(e.target.value)} className="min-h-touch rounded-md border border-line-strong bg-surface px-3 text-body-lg">
          {s.available_providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <p className="text-body-sm text-muted">{t("pay.mock_note")}</p>
      </div>
      <Input id="pay-merchant" label={t("pay.merchant")} value={merchant} onChange={(e) => setMerchant(e.target.value)} />
      <Input id="pay-secret" label={t("pay.secret")} type="password" autoComplete="new-password" value={secret} hint={s.has_secret ? t("pay.secret_set") : undefined} onChange={(e) => setSecret(e.target.value)} />
      <label className="flex min-h-touch items-center gap-3 text-body font-semibold"><input type="checkbox" className="h-6 w-6" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{t("pay.enabled")}</label>
      <p className="break-all text-body-sm text-muted">Webhook: /v1/webhooks/{provider}/{slug}</p>
      <Button loading={busy} onClick={save}>{t("ui.save")}</Button>
    </Card>
  );
}
