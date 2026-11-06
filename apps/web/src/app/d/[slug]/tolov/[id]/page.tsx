"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@dostavka/ui";
import { ShopShell } from "@/components/shop-shell";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getSession } from "@/lib/session";

/** Sinov to'lov sahifasi (mock provayder). Haqiqiy provayderlarda xaridor provayder sahifasiga yo'naltiriladi; bu sahifa faqat sandbox uchun. */
export default function SandboxPayPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = use(params);
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<"captured" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!getSession()?.signedIn) router.replace(`/kirish?next=${encodeURIComponent(`/d/${slug}`)}`); }, [router, slug]);

  const go = async (outcome: "captured" | "failed") => {
    setBusy(outcome); setError(null);
    try {
      await api(`/v1/shops/${slug}/payments/${id}/sandbox`, { method: "POST", body: { outcome } });
      const orders = await api<{ items: { id: string; payment: { id: string } | null }[] }>(`/v1/shops/${slug}/orders?limit=20`);
      const o = orders.items.find((x) => x.payment?.id === id);
      router.replace(o ? `/d/${slug}/buyurtma/${o.id}` : `/d/${slug}/buyurtma`);
    } catch (e) { setError(e instanceof ApiError ? e.text(locale) : t("ui.error_generic")); setBusy(null); }
  };
  return (
    <ShopShell slug={slug} name={slug} back>
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-title font-extrabold">{t("pay.title")}</h1>
        <Card className="flex flex-col gap-3">
          <p className="text-body text-muted">{t("pay.sandbox_hint")}</p>
          <Button loading={busy === "captured"} disabled={busy !== null} onClick={() => go("captured")}>{t("pay.pay")}</Button>
          <Button variant="ghost" loading={busy === "failed"} disabled={busy !== null} onClick={() => go("failed")}>{t("pay.decline")}</Button>
          {error && <p role="alert" className="text-body-sm font-semibold text-danger">{error}</p>}
        </Card>
      </div>
    </ShopShell>
  );
}
