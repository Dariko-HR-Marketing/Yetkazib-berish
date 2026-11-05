import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors";
import { Clock } from "../../common/clock";
import { DbService, type Tx } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";
import { mapUnique } from "./catalog.service";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "./catalog.dto";
import { XlsxError, parseCsv, parsePriceTiyin, parseQuantityMilli, parseXlsx } from "./parsers";
import { StockService } from "./stock.service";

/** Sarlavha nomlari (uz/ru/en) -> maydon. Normallash: kichik harf, harf/raqamdan boshqa belgilar olib tashlanadi. */
const ALIASES: Record<string, string[]> = {
  name_uz: ["nomuz", "nomiuz", "nomi", "nom", "name", "nameuz", "mahsulot", "mahsulotnomi"],
  name_ru: ["nomru", "nomiru", "nameru", "наименование", "название", "наименованиеру", "namerus"],
  sku: ["sku", "artikul", "артикул", "kod", "код"],
  barcode: ["shtrixkod", "shtrixkodi", "barcode", "штрихкод", "ean", "shtrix"],
  mxik: ["mxik", "ikpu", "икпу", "мхик"],
  price: ["narx", "narxi", "narxsom", "price", "цена", "narxuzs"],
  unit: ["birlik", "unit", "едизм", "единица", "ед", "олчовбирлиги"],
  quantity: ["qoldiq", "miqdor", "stock", "quantity", "qty", "остаток", "количество"],
  category: ["kategoriya", "category", "категория", "guruh"],
  status: ["holat", "status", "статус"],
};
const norm = (h: string) => h.toLowerCase().replace(/['’`ʻʼ]/g, "").replace(/[^a-zа-яё0-9]/g, "");
const HEADER_MAP = new Map<string, string>();
for (const [field, names] of Object.entries(ALIASES)) for (const n of names) HEADER_MAP.set(norm(n), field);

const UNIT_MAP: Record<string, "piece" | "kg" | "l"> = {
  dona: "piece", шт: "piece", piece: "piece", pcs: "piece", pc: "piece", sht: "piece",
  kg: "kg", кг: "kg", kilogramm: "kg", l: "l", л: "l", litr: "l", lt: "l",
};
const STATUS_MAP: Record<string, "active" | "hidden"> = {
  faol: "active", active: "active", активен: "active", активный: "active", yashirin: "hidden", hidden: "hidden", скрыт: "hidden", скрытый: "hidden",
};
export const PRICE_JUMP_PCT = 30;

export interface ImportRowError { row: number; code: string; field?: string; params?: Record<string, string | number> }
export interface ImportResult {
  mode: "preview" | "apply"; job_id: string | null; total_rows: number; created: number; updated: number; unchanged: number; errors: ImportRowError[];
  skipped_price_jumps: number; price_jumps: { row: number; old_tiyin: number; new_tiyin: number }[]; ignored_columns: string[]; duration_ms: number;
}

interface ParsedRow {
  row: number; name_uz?: string; name_ru?: string; sku?: string; barcode?: string; mxik?: string; price?: number; unit?: "piece" | "kg" | "l";
  quantity?: number; category?: string; status?: "active" | "hidden";
}

interface ExistingProduct {
  id: string; category_id: string | null; name_uz: string; name_ru: string | null; sku: string | null; barcode: string | null; mxik: string | null;
  unit: string; price_tiyin: string; status: string;
}

class PreviewRollback extends Error {}

@Injectable()
export class ImportService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly stock: StockService, private readonly clock: Clock) {}

  // ---------------------------------------------------------------- fayl -> jadval
  private tableOf(format: "csv" | "xlsx", b64: string): string[][] {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new ApiError(400, "import.invalid_file");
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0) throw new ApiError(400, "import.invalid_file");
    if (buf.length > IMPORT_MAX_BYTES) throw new ApiError(413, "import.too_large");
    if (format === "csv") return parseCsv(buf.toString("utf8"));
    try { return parseXlsx(new Uint8Array(buf.buffer, buf.byteOffset, buf.length)); } catch (e) {
      throw new ApiError(400, e instanceof XlsxError && e.message === "too_large" ? "import.too_large" : "import.invalid_file");
    }
  }

  private parseTable(table: string[][]): { rows: ParsedRow[]; errors: ImportRowError[]; ignored: string[] } {
    const header = table[0];
    if (!header) throw new ApiError(422, "import.no_columns");
    const cols: { idx: number; field: string }[] = [];
    const ignored: string[] = [];
    const seen = new Set<string>();
    header.forEach((h, idx) => {
      const f = HEADER_MAP.get(norm(h));
      if (f && !seen.has(f)) { cols.push({ idx, field: f }); seen.add(f); } else if (h) ignored.push(h);
    });
    if (!seen.has("name_uz") && !seen.has("name_ru") && !seen.has("sku") && !seen.has("barcode")) throw new ApiError(422, "import.no_columns", { columns: ignored.slice(0, 20) });
    const data = table.slice(1);
    if (data.length > IMPORT_MAX_ROWS) throw new ApiError(422, "import.too_many_rows", { max: IMPORT_MAX_ROWS }, { max: IMPORT_MAX_ROWS });
    const rows: ParsedRow[] = [];
    const errors: ImportRowError[] = [];
    data.forEach((cells, i) => {
      const row = i + 2; // jadvaldagi qator raqami (1 = sarlavha)
      const p: ParsedRow = { row };
      const bad = (code: string, field: string, params?: Record<string, string | number>) => errors.push({ row, code, field, params });
      let ok = true;
      for (const { idx, field } of cols) {
        const v = (cells[idx] ?? "").trim();
        if (v === "") continue;
        switch (field) {
          case "name_uz": case "name_ru": if (v.length > 200) { bad("too_long", field); ok = false; } else p[field] = v; break;
          case "sku": if (v.length > 64) { bad("too_long", field); ok = false; } else p.sku = v; break;
          case "barcode": { const d = v.replace(/[\s-]/g, "").replace(/\.0+$/, ""); if (!/^[0-9]{6,14}$/.test(d)) { bad("barcode_invalid", field); ok = false; } else p.barcode = d; break; }
          case "mxik": { const d = v.replace(/[\s-]/g, "").replace(/\.0+$/, ""); if (!/^[0-9]{17}$/.test(d)) { bad("mxik_invalid", field); ok = false; } else p.mxik = d; break; }
          case "price": { const t = parsePriceTiyin(v); if (t === null) { bad("price_invalid", field); ok = false; } else p.price = t; break; }
          case "quantity": { const q = parseQuantityMilli(v); if (q === null) { bad("quantity_invalid", field); ok = false; } else p.quantity = q; break; }
          case "unit": { const u = UNIT_MAP[v.toLowerCase().replace(/[.\s]/g, "")]; if (!u) { bad("unit_unknown", field, { value: v.slice(0, 20) }); ok = false; } else p.unit = u; break; }
          case "status": { const s = STATUS_MAP[v.toLowerCase()]; if (!s) { bad("status_unknown", field, { value: v.slice(0, 20) }); ok = false; } else p.status = s; break; }
          case "category": p.category = v.slice(0, 120); break;
        }
      }
      if (ok) rows.push(p);
    });
    return { rows, errors, ignored };
  }

  // ---------------------------------------------------------------- asosiy oqim
  async run(tenantId: string, userId: string, d: { format: "csv" | "xlsx"; content_base64: string; mode: "preview" | "apply"; branch_id?: string; confirm_price_jumps: boolean }, ip?: string | null): Promise<ImportResult> {
    const started = Date.now();
    const table = this.tableOf(d.format, d.content_base64);
    const { rows, errors, ignored } = this.parseTable(table);
    const totalRows = table.length - 1;

    let result!: Omit<ImportResult, "mode" | "job_id" | "duration_ms" | "total_rows" | "ignored_columns">;
    const body = async (tx: Tx) => {
      result = await this.apply(tx, tenantId, userId, rows, errors, d.branch_id, d.confirm_price_jumps);
    };
    let jobId: string | null = null;
    if (d.mode === "preview") {
      try { await this.db.tx({ tenantId, userId }, async (tx) => { await body(tx); throw new PreviewRollback(); }); } catch (e) { if (!(e instanceof PreviewRollback)) throw e; }
    } else {
      await this.db.tx({ tenantId, userId }, body);
    }
    const duration = Date.now() - started;
    if (d.mode === "apply") {
      jobId = await this.db.tx({ tenantId, userId }, async (tx) => {
        const j = (await tx.query<{ id: string }>(
          `insert into import_jobs (tenant_id, created_by, format, status, total_rows, created_count, updated_count, error_count, skipped_price_jumps, errors, duration_ms, created_at)
           values ($1,$2,$3,'applied',$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
          [tenantId, userId, d.format, totalRows, result.created, result.updated, result.errors.length, result.skipped_price_jumps, JSON.stringify(result.errors.slice(0, 500)), duration, this.clock.now()])).rows[0]!;
        await this.audit.record(tx, { tenantId, actorId: userId, action: "catalog.imported", entity: "import_job", entityId: j.id, after: { total_rows: totalRows, created: result.created, updated: result.updated, errors: result.errors.length }, ip });
        return j.id;
      });
    }
    return { mode: d.mode, job_id: jobId, total_rows: totalRows, ignored_columns: ignored, duration_ms: duration, ...result };
  }

  private async apply(tx: Tx, tenantId: string, userId: string, rows: ParsedRow[], preErrors: ImportRowError[], branchParam: string | undefined, confirmJumps: boolean) {
    const errors: ImportRowError[] = [...preErrors];
    const priceJumps: { row: number; old_tiyin: number; new_tiyin: number }[] = [];
    let created = 0, updated = 0, unchanged = 0, skippedJumps = 0;

    // filial (qoldiq ustuni bo'lsa kerak)
    let branchId: string | null = null;
    if (rows.some((r) => r.quantity !== undefined)) {
      const bs = (await tx.query<{ id: string }>("select id from branches where tenant_id = $1 order by created_at", [tenantId])).rows;
      if (branchParam) {
        if (!bs.some((b) => b.id === branchParam)) throw new ApiError(404, "not_found");
        branchId = branchParam;
      } else if (bs.length === 1) branchId = bs[0]!.id;
      else throw new ApiError(422, "import.branch_required", { branches: bs.length });
    }

    const cats = new Map<string, string>(); // lower(name_uz) -> id
    const loadCats = async () => {
      cats.clear();
      for (const c of (await tx.query<{ id: string; name_uz: string }>("select id, name_uz from categories where tenant_id = $1", [tenantId])).rows) cats.set(c.name_uz.toLowerCase(), c.id);
    };
    await loadCats();
    const seenBarcode = new Map<string, number>();
    const seenSku = new Map<string, number>();

    for (const r of rows) {
      // fayl ichida takror
      const dupB = r.barcode ? seenBarcode.get(r.barcode) : undefined;
      const dupS = r.sku ? seenSku.get(r.sku.toLowerCase()) : undefined;
      if (dupB !== undefined || dupS !== undefined) { errors.push({ row: r.row, code: "duplicate_in_file", field: dupB !== undefined ? "barcode" : "sku", params: { first_row: (dupB ?? dupS)! } }); continue; }
      if (r.barcode) seenBarcode.set(r.barcode, r.row);
      if (r.sku) seenSku.set(r.sku.toLowerCase(), r.row);

      await tx.query("savepoint row_sp");
      try {
        const out = await this.applyRow(tx, tenantId, userId, r, branchId, cats, confirmJumps);
        if (out.kind === "error") { await tx.query("rollback to savepoint row_sp"); await loadCats(); errors.push({ row: r.row, code: out.code, field: out.field }); }
        else if (out.kind === "jump") { await tx.query("rollback to savepoint row_sp"); await loadCats(); skippedJumps++; priceJumps.push({ row: r.row, old_tiyin: out.old, new_tiyin: out.next }); errors.push({ row: r.row, code: "price_jump", field: "price", params: { percent: PRICE_JUMP_PCT } }); }
        else { await tx.query("release savepoint row_sp"); if (out.kind === "created") created++; else if (out.kind === "updated") updated++; else unchanged++; }
      } catch (e) {
        await tx.query("rollback to savepoint row_sp");
        await loadCats();
        try { mapUnique(e); } catch (m) {
          if (m instanceof ApiError) { errors.push({ row: r.row, code: m.code.replace("catalog.", ""), field: m.code.includes("barcode") ? "barcode" : "sku" }); continue; }
        }
        throw e;
      }
    }
    errors.sort((a, b) => a.row - b.row);
    return { created, updated, unchanged, errors, skipped_price_jumps: skippedJumps, price_jumps: priceJumps };
  }

  private async applyRow(tx: Tx, tenantId: string, userId: string, r: ParsedRow, branchId: string | null, cats: Map<string, string>, confirmJumps: boolean):
    Promise<{ kind: "created" | "updated" | "unchanged" } | { kind: "error"; code: string; field?: string } | { kind: "jump"; old: number; next: number }> {
    // moslik: shtrix-kod, so'ng artikul
    let existing: ExistingProduct | null = null;
    if (r.barcode) existing = (await tx.query<ExistingProduct>("select * from products where tenant_id = $1 and barcode = $2 and status <> 'archived' for update", [tenantId, r.barcode])).rows[0] ?? null;
    if (r.sku) {
      const bySku = (await tx.query<ExistingProduct>("select * from products where tenant_id = $1 and lower(sku) = lower($2) and status <> 'archived' for update", [tenantId, r.sku])).rows[0] ?? null;
      if (existing && bySku && existing.id !== bySku.id) return { kind: "error", code: "ambiguous_match", field: "sku" };
      existing = existing ?? bySku;
    }

    let categoryId: string | null | undefined;
    if (r.category) {
      const key = r.category.toLowerCase();
      categoryId = cats.get(key);
      if (!categoryId) {
        categoryId = (await tx.query<{ id: string }>("insert into categories (tenant_id, name_uz) values ($1,$2) returning id", [tenantId, r.category])).rows[0]!.id;
        cats.set(key, categoryId);
      }
    }

    let productId: string;
    let kind: "created" | "updated" | "unchanged" = "unchanged";
    if (!existing) {
      if (!r.name_uz) return { kind: "error", code: "name_missing", field: "name_uz" };
      if (r.price === undefined) return { kind: "error", code: "price_missing", field: "price" };
      productId = (await tx.query<{ id: string }>(
        `insert into products (tenant_id, category_id, name_uz, name_ru, sku, barcode, mxik, unit, price_tiyin, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [tenantId, categoryId ?? null, r.name_uz, r.name_ru ?? null, r.sku ?? null, r.barcode ?? null, r.mxik ?? null, r.unit ?? "piece", r.price, r.status ?? "active"])).rows[0]!.id;
      kind = "created";
    } else {
      productId = existing.id;
      const old = Number(existing.price_tiyin);
      if (r.price !== undefined && old > 0 && r.price !== old && Math.abs(r.price - old) * 100 > old * PRICE_JUMP_PCT && !confirmJumps) return { kind: "jump", old, next: r.price };
      const next = {
        category_id: categoryId === undefined ? existing.category_id : categoryId, name_uz: r.name_uz ?? existing.name_uz, name_ru: r.name_ru ?? existing.name_ru,
        sku: r.sku ?? existing.sku, barcode: r.barcode ?? existing.barcode, mxik: r.mxik ?? existing.mxik, unit: r.unit ?? existing.unit,
        price_tiyin: r.price ?? old, status: r.status ?? existing.status,
      };
      const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) => String(next[k] ?? "") !== String(k === "price_tiyin" ? old : existing[k] ?? ""));
      if (changed) {
        await tx.query(
          `update products set category_id=$3, name_uz=$4, name_ru=$5, sku=$6, barcode=$7, mxik=$8, unit=$9, price_tiyin=$10, status=$11, updated_at=now() where id=$1 and tenant_id=$2`,
          [productId, tenantId, next.category_id, next.name_uz, next.name_ru, next.sku, next.barcode, next.mxik, next.unit, next.price_tiyin, next.status]);
        if (next.price_tiyin !== old) await this.audit.record(tx, { tenantId, actorId: userId, action: "product.price_changed", entity: "product", entityId: productId, before: { price_tiyin: old }, after: { price_tiyin: next.price_tiyin } });
        kind = "updated";
      }
    }
    if (r.quantity !== undefined && branchId) {
      const before = (await tx.query<{ q: string }>("select quantity_milli as q from stock where product_id = $1 and branch_id = $2 and tenant_id = $3", [productId, branchId, tenantId])).rows[0];
      if (!before || Number(before.q) !== r.quantity) {
        await this.stock.setInTx(tx, tenantId, userId, productId, branchId, r.quantity, "import", "import");
        if (kind === "unchanged") kind = "updated";
      }
    }
    return { kind };
  }

  // ---------------------------------------------------------------- tarix
  list(tenantId: string, userId: string, limit: number) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query(
        `select id, format, status, total_rows, created_count, updated_count, error_count, skipped_price_jumps, duration_ms, created_at from import_jobs where tenant_id = $1 order by created_at desc, id limit $2`, [tenantId, limit]);
      return { items: r.rows };
    });
  }

  get(tenantId: string, userId: string, id: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query("select id, format, status, total_rows, created_count, updated_count, error_count, skipped_price_jumps, errors, duration_ms, created_at from import_jobs where id = $1 and tenant_id = $2", [id, tenantId]);
      if (!r.rows[0]) throw new ApiError(404, "not_found");
      return r.rows[0];
    });
  }
}
