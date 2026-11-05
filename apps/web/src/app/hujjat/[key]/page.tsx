"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, ErrorState, Skeleton } from "@dostavka/ui";
import { LangSwitch } from "@/components/shell";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Markdown } from "@/lib/markdown";

interface Doc { key: string; title: string; version: string; locale: "uz" | "ru"; translated: boolean; status: "draft" | "effective" | "retired"; effective_from: string | null; text_hash: string; body_md: string }

/** Ommaviy hujjat sahifasi: kirishsiz ochiladi; ?version= bilan aynan akcept qilingan versiya ko'rinadi. */
export default function LegalDocPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const version = useSearchParams().get("version");
  const { t, locale } = useI18n();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null); setDoc(null);
    try {
      setDoc(await api<Doc>(`/v1/legal/documents/${encodeURIComponent(key)}${version ? `?version=${encodeURIComponent(version)}` : ""}`, { auth: false }));
    } catch (e) { setError(e instanceof ApiError ? e.text(locale) : t("ui.error_network")); }
  }, [key, version, locale, t]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-[820px] px-4 pb-16 md:px-6" style={{ paddingTop: "calc(12px + var(--safe-top))" }}>
      <header className="flex items-center justify-between py-3">
        <span className="text-title-sm font-extrabold text-brand-dark">{t("ui.app_name")}</span>
        <LangSwitch />
      </header>
      {error ? <ErrorState message={error} onRetry={load} retryLabel={t("ui.retry")} />
        : !doc ? <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-64" /></div>
        : (
          <article>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{t("legal.version", { version: doc.version })}</Badge>
              {doc.effective_from && <Badge tone="ok">{t("legal.effective", { date: new Date(doc.effective_from).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ") })}</Badge>}
              {doc.status === "retired" && <Badge tone="warning">archive</Badge>}
            </div>
            {doc.status === "draft" && <p role="note" className="mb-4 rounded-lg bg-warning-soft p-3 font-semibold text-warning">{t("legal.draft_notice")}</p>}
            {!doc.translated && <p role="note" className="mb-4 rounded-lg bg-info-soft p-3 font-semibold text-info">{t("legal.not_translated")}</p>}
            <Markdown source={doc.body_md} />
            <p className="mt-8 break-all text-caption text-muted">{t("legal.hash", { hash: doc.text_hash })}</p>
          </article>
        )}
    </div>
  );
}
