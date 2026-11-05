"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@dostavka/ui";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getSession, setTenant } from "@/lib/session";
import { PageSkeleton } from "@/components/shell";

/** T-3: SMS havola. Kirmagan bo'lsa tokenni eslab /kirish ga, kirgach shu yerga qaytadi. */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(async () => {
    setError(null);
    try {
      const m = await api<{ tenant_id: string }>(`/v1/invites/${encodeURIComponent(token)}/accept`, { method: "POST" });
      sessionStorage.removeItem("dostavka.invite");
      setTenant(m.tenant_id);
      router.replace("/jamoa");
    } catch (e) {
      sessionStorage.removeItem("dostavka.invite");
      setError(e instanceof ApiError ? e.text(locale) : t("ui.error_generic"));
    }
  }, [token, router, locale, t]);

  useEffect(() => {
    if (!getSession()) { sessionStorage.setItem("dostavka.invite", token); router.replace("/kirish"); return; }
    void accept();
  }, [token, router, accept]);

  return error ? <div className="mx-auto max-w-md p-6"><ErrorState message={error} onRetry={() => router.replace("/")} retryLabel={t("ui.back")} /></div> : <PageSkeleton />;
}
