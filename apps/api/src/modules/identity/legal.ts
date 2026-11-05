import { sha256 } from "../../common/crypto";

/** Joriy hujjat versiyalari (matnlar yurist tasdig'igacha — loyiha, docs/02_huquqiy). */
export const LEGAL_DOCS = {
  customer_offer: "2026-11-05",
  privacy_policy: "2026-11-05",
} as const;
export type LegalDocument = keyof typeof LEGAL_DOCS;
export const MARKETING_DOC = { document: "marketing", version: "2026-11-05" } as const;

/** Rozilik matni xeshi. TODO(O3): yurist matnni tasdiqlagach, xesh haqiqiy fayl mazmunidan olinadi. */
export const textHash = (document: string, version: string) => sha256(`${document}@${version}`);

export const REQUIRED_CONSENTS = Object.entries(LEGAL_DOCS).map(([document, version]) => ({ document, version }));

export function consentsSatisfied(given: { document: string; version: string }[] | undefined): boolean {
  return REQUIRED_CONSENTS.every((r) => given?.some((g) => g.document === r.document && g.version === r.version));
}
