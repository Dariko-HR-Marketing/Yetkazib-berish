import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { Clock } from "../../common/clock";
import { ApiError } from "../../common/errors";
import { CONFIG, type Config } from "../../config";
import { DbService, type Tx } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";

export type Audience = "customer" | "shop" | "courier";
export type LegalKey = "customer_offer" | "privacy_policy" | "shop_saas_offer" | "shop_dpa" | "courier_agreement";
/** Qaysi hujjatlarni kim akcept qiladi (S0: xaridor/foydalanuvchi va do'kon egasi). */
export const REQUIRED_KEYS: Record<"customer" | "shop", LegalKey[]> = {
  customer: ["customer_offer", "privacy_policy"],
  shop: ["shop_saas_offer", "shop_dpa"],
};
export const ACCEPTABLE_KEYS = [...REQUIRED_KEYS.customer, ...REQUIRED_KEYS.shop] as const;
/** Marketing roziligi alohida va ixtiyoriy. Matn xeshi: TODO(O3) — yurist matnni tasdiqlagach hujjatga bog'lanadi. */
export const MARKETING = { document: "marketing", version: "1", text_hash: createHash("sha256").update("marketing@1").digest("hex") } as const;

export interface LegalDoc {
  id: string; key: LegalKey; locale: "uz" | "ru"; version: number; title: string; audience: Audience;
  text_hash: string; status: "draft" | "effective" | "retired"; effective_from: Date | null;
}
export interface ConsentInput { document: string; version: string }
export interface MissingDoc { document: string; version: string; title: string; text_hash: string; status: string }

const COLS = "id, key, locale, version, title, audience, text_hash, status, effective_from";

/** Joyiy `[nomi]`-ko'rinishidagi to'ldirilmagan joylar (markdown'da `\[...\]`); `[matn](havola)` istisno. */
export const PLACEHOLDER = /\\?\[(?![^\]]*\]\()([^\]\n]{2,80}?)\\?\](?!\()/g;
export const findPlaceholders = (md: string): string[] => [...md.matchAll(PLACEHOLDER)].map((m) => m[1]!.replace(/\\/g, "")).filter((v, i, a) => a.indexOf(v) === i);

export const legalDraftDto = z.object({
  key: z.enum(["customer_offer", "privacy_policy", "shop_saas_offer", "shop_dpa", "courier_agreement"]),
  locale: z.enum(["uz", "ru"]),
  title: z.string().trim().min(3).max(200),
  body_md: z.string().min(200).max(200_000),
}).strict();
export const publishDto = z.object({ effective_from: z.string().datetime().optional() }).strict();

@Injectable()
export class LegalService {
  constructor(private readonly db: DbService, private readonly clock: Clock, private readonly audit: AuditService, @Inject(CONFIG) private readonly cfg: Config) {}

  private get allowDraft() { return this.cfg.LEGAL_ALLOW_DRAFT === "on"; }

  /** Har hujjat uchun hozir akcept qilinadigan versiya: amaldagi (effective), bo'lmasa — ruxsat berilsa — oxirgi qoralama. */
  async current(tx: Tx, keys: readonly LegalKey[], locale: "uz" | "ru" = "uz"): Promise<(LegalDoc & { translated: boolean })[]> {
    const out: (LegalDoc & { translated: boolean })[] = [];
    for (const key of keys) {
      const statuses = this.allowDraft ? ["effective", "draft"] : ["effective"];
      const r = await tx.query<LegalDoc>(
        `select ${COLS} from legal_documents where key = $1 and locale = any($2) and status = any($3)
         order by (locale = $4) desc, (status = 'effective') desc, version desc limit 1`, [key, locale === "ru" ? ["ru", "uz"] : ["uz"], statuses, locale]);
      const d = r.rows[0];
      if (!d) throw new ApiError(503, "consent.documents_unavailable", { document: key });
      out.push({ ...d, translated: d.locale === locale });
    }
    return out;
  }

  /**
   * Foydalanuvchi (yoki do'kon) hali qabul qilmagan yoki yangi versiyasi chiqqan hujjatlar. Berilgan `given` ro'yxati
   * to'g'ri versiyani ko'rsatsa, ular qabul qilingan hisoblanadi (qaytariladigan ro'yxatdan chiqariladi) va `accept` ga qo'shiladi.
   */
  async evaluate(tx: Tx, scope: { userId?: string | null; tenantId?: string | null }, audience: "customer" | "shop", given: ConsentInput[] | undefined) {
    const docs = await this.current(tx, REQUIRED_KEYS[audience]);
    const accepted = new Map<string, string>();
    if (scope.userId || scope.tenantId) {
      const r = await tx.query<{ document: string; version: string; action: string }>(
        scope.tenantId
          ? `select distinct on (document) document, version, action from consents where tenant_id = $1 and document = any($2) order by document, created_at desc`
          : `select distinct on (document) document, version, action from consents where user_id = $1 and tenant_id is null and document = any($2) order by document, created_at desc`,
        [scope.tenantId ?? scope.userId, docs.map((d) => d.key)]);
      for (const row of r.rows) if (row.action === "accepted") accepted.set(row.document, row.version);
    }
    const missing: MissingDoc[] = [];
    const toRecord: (LegalDoc & { translated: boolean })[] = [];
    for (const d of docs) {
      if (accepted.get(d.key) === String(d.version)) continue;
      if (given?.some((g) => g.document === d.key && g.version === String(d.version))) toRecord.push(d);
      else missing.push({ document: d.key, version: String(d.version), title: d.title, text_hash: d.text_hash, status: d.status });
    }
    return { missing, toRecord };
  }

  // ---------------------------------------------------------------- ommaviy o'qish
  async list(audience: Audience | undefined, locale: "uz" | "ru") {
    return this.db.tx({}, async (tx) => {
      const keys = audience === "courier" ? (["courier_agreement"] as LegalKey[]) : audience ? REQUIRED_KEYS[audience] : [...ACCEPTABLE_KEYS];
      const items = await this.current(tx, keys, locale);
      return { items: items.map((d) => this.view(d)) };
    });
  }

  async get(key: string, locale: "uz" | "ru", version?: number) {
    return this.db.tx({}, async (tx) => {
      const r = await tx.query<LegalDoc & { body_md: string }>(
        `select ${COLS}, body_md from legal_documents where key = $1 and locale = any($2) and ($3::int is null or version = $3)
           and ($3::int is not null or status = any($4)) order by ($3::int is null and locale = $5) desc, (locale = $5) desc, (status = 'effective') desc, version desc limit 1`,
        [key, locale === "ru" ? ["ru", "uz"] : ["uz"], version ?? null, this.allowDraft ? ["effective", "draft"] : ["effective"], locale]);
      const d = r.rows[0];
      if (!d || (version !== undefined && d.status === "draft" && !this.allowDraft)) throw new ApiError(404, "not_found");
      return { ...this.view({ ...d, translated: d.locale === locale }), body_md: d.body_md };
    });
  }

  private view(d: LegalDoc & { translated: boolean }) {
    return { key: d.key, title: d.title, version: String(d.version), locale: d.locale, translated: d.translated, status: d.status, effective_from: d.effective_from, text_hash: d.text_hash };
  }

  // ---------------------------------------------------------------- admin: yangi versiya va kuchga kiritish
  async adminList(actorId: string) {
    return this.db.tx({ userId: actorId, platform: true }, async (tx) => ({ items: (await tx.query<LegalDoc>(`select ${COLS} from legal_documents order by key, locale, version desc`)).rows.map((d) => ({ ...d, version: String(d.version) })) }));
  }

  async createDraft(actorId: string, d: z.infer<typeof legalDraftDto>, ip?: string | null) {
    return this.db.tx({ userId: actorId, platform: true }, async (tx) => {
      const aud = ({ customer_offer: "customer", privacy_policy: "customer", shop_saas_offer: "shop", shop_dpa: "shop", courier_agreement: "courier" } as const)[d.key];
      const v = (await tx.query<{ v: number }>("select coalesce(max(version), 0) + 1 as v from legal_documents where key = $1 and locale = $2", [d.key, d.locale])).rows[0]!.v;
      const hash = createHash("sha256").update(d.body_md).digest("hex");
      const doc = (await tx.query<LegalDoc>(
        `insert into legal_documents (key, locale, version, title, audience, body_md, text_hash) values ($1,$2,$3,$4,$5,$6,$7) returning ${COLS}`,
        [d.key, d.locale, v, d.title, aud, d.body_md, hash])).rows[0]!;
      await this.audit.record(tx, { actorId, action: "legal.draft_created", entity: "legal_document", entityId: doc.id, after: { key: d.key, locale: d.locale, version: v, text_hash: hash }, ip });
      return { ...doc, version: String(doc.version), placeholders: findPlaceholders(d.body_md) };
    });
  }

  /**
   * Kuchga kiritish: to'ldirilmagan joylar (`[nomi, STIR]`, `[summa]` va h.k.) qolgan bo'lsa rad etiladi — yurist tasdiqlagan,
   * rekvizitlari to'ldirilgan matngina amalga kiradi. Oldingi amaldagi versiya eskiradi; foydalanuvchilar keyingi kirishda yangisini qabul qiladi.
   */
  async publish(actorId: string, id: string, effectiveFrom?: string, ip?: string | null) {
    return this.db.tx({ userId: actorId, platform: true }, async (tx) => {
      const d = (await tx.query<LegalDoc & { body_md: string }>(`select ${COLS}, body_md from legal_documents where id = $1 for update`, [id])).rows[0];
      if (!d) throw new ApiError(404, "not_found");
      if (d.status !== "draft") throw new ApiError(409, "legal.not_draft");
      const ph = findPlaceholders(d.body_md);
      if (ph.length) throw new ApiError(422, "legal.placeholders_remain", { placeholders: ph });
      const from = effectiveFrom ? new Date(effectiveFrom) : this.clock.now();
      const prev = (await tx.query<{ id: string; version: number }>("select id, version from legal_documents where key = $1 and locale = $2 and status = 'effective' for update", [d.key, d.locale])).rows[0];
      if (prev) await tx.query("update legal_documents set status = 'retired' where id = $1", [prev.id]);
      await tx.query("update legal_documents set status = 'effective', effective_from = $2, published_by = $3 where id = $1", [id, from, actorId]);
      await this.audit.record(tx, { actorId, action: "legal.published", entity: "legal_document", entityId: id, before: prev ? { effective_version: prev.version } : null, after: { key: d.key, locale: d.locale, version: d.version, effective_from: from.toISOString(), text_hash: d.text_hash }, ip });
      return { id, key: d.key, locale: d.locale, version: String(d.version), status: "effective", effective_from: from, text_hash: d.text_hash };
    });
  }
}
