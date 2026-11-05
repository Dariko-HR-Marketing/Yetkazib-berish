"use client";
import { useI18n } from "@/lib/i18n";

export interface ConsentDoc { document: string; version: string; title?: string }

/** Hujjatlarga havola (yangi oynada) va bitta akcept belgisi. Versiya serverdan keladi — qattiq kodlanmagan. */
export function ConsentBox({ docs, accepted, onChange, intro, children }: { docs: ConsentDoc[]; accepted: boolean; onChange: (v: boolean) => void; intro: string; children?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-brand-soft p-3">
      <label className="flex min-h-touch items-start gap-3 text-body">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--c-brand)]" checked={accepted} onChange={(e) => onChange(e.target.checked)} />
        <span>{intro}</span>
      </label>
      <ul className="flex flex-col pl-8">
        {docs.map((d) => (
          <li key={d.document}>
            <a href={`/hujjat/${d.document}?version=${encodeURIComponent(d.version)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-touch items-center font-bold">
              {t(`legal.doc.${d.document}`)} · {t("legal.version", { version: d.version })} ↗<span className="sr-only"> ({t("legal.open_new_tab")})</span>
            </a>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}
