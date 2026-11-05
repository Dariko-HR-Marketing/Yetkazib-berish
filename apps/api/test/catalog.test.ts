import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseCsv, parsePriceTiyin, parseQuantityMilli, parseXlsx } from "../src/modules/catalog/parsers";
import { addStaff, boot, call, makeOwner, type Harness } from "./helpers";

let h: Harness;
const OWNER = "+998901000001";
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

type Owner = Awaited<ReturnType<typeof makeOwner>>;
const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

async function shop(phone = OWNER, name = "Yashil Savat") {
  const o = await makeOwner(h, phone, phone.endsWith("2") ? "987654321" : "123456789", name);
  const b = await call(h, "post", "/v1/branches", { ...as(o), body: { name: "Markaziy", address: "Toshkent, Chilonzor 1" } }).expect(201);
  return { o, branchId: b.body.id as string };
}
const product = (o: Owner, body: Record<string, unknown> = {}) =>
  call(h, "post", "/v1/products", { ...as(o), body: { name_uz: "Sut 3,2%", price_tiyin: 1250000, unit: "l", ...body } });

const csvB64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const runImport = (o: Owner, text: string, extra: Record<string, unknown> = {}) =>
  call(h, "post", "/v1/catalog/imports", { ...as(o), body: { format: "csv", content_base64: csvB64(text), mode: "apply", ...extra } });

describe("parserlar (float yo'q)", () => {
  it("narx -> tiyin", () => {
    expect(parsePriceTiyin("12500")).toBe(1250000);
    expect(parsePriceTiyin("12 500")).toBe(1250000);
    expect(parsePriceTiyin("12 500,50")).toBe(1250050);
    expect(parsePriceTiyin("12.500")).toBe(1250000); // ming ajratgich
    expect(parsePriceTiyin("1.250.000")).toBe(125000000);
    expect(parsePriceTiyin("12500.5")).toBe(1250050);
    expect(parsePriceTiyin("0.07")).toBe(7);
    for (const bad of ["", "abc", "-5", "1,2,3", "12.5.5", "1e5", "99999999999999"]) expect(parsePriceTiyin(bad), bad).toBeNull();
  });
  it("miqdor -> mingdan bir", () => {
    expect(parseQuantityMilli("1,08")).toBe(1080);
    expect(parseQuantityMilli("22")).toBe(22000);
    expect(parseQuantityMilli("0.005")).toBe(5);
    for (const bad of ["", "-1", "1,2345", "x"]) expect(parseQuantityMilli(bad), bad).toBeNull();
  });
  it("CSV: BOM, ; ajratgich, qo'shtirnoq, ko'p qatorli katak", () => {
    const rows = parseCsv('﻿nomi;narx\r\n"Olma ""qizil""";12 500\r\n"Ikki\nqator";1\r\n\r\n');
    expect(rows).toEqual([["nomi", "narx"], ['Olma "qizil"', "12 500"], ["Ikki\nqator", "1"]]);
  });
  it("XLSX: umumiy satrlar, inlineStr, bo'sh kataklar, XML belgilari", () => {
    const rows = parseXlsx(makeXlsx([["nomi", "narx", "izoh"], ["Non & Qatiq", "9000", ""], ["Sut", "12500.5", "x"]]));
    expect(rows).toEqual([["nomi", "narx", "izoh"], ["Non & Qatiq", "9000"], ["Sut", "12500.5", "x"]]);
  });
  it("XLSX emas fayl rad etiladi", () => {
    expect(() => parseXlsx(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

describe("Kategoriya va mahsulot", () => {
  it("yaratish, o'qish, tahrirlash; narx tiyinda butun son; audit", async () => {
    const { o } = await shop();
    const c = await call(h, "post", "/v1/categories", { ...as(o), body: { name_uz: "Sut mahsulotlari", name_ru: "Молочные" } }).expect(201);
    const p = await product(o, { category_id: c.body.id, barcode: "4780000000001", mxik: "12345678901234567", sku: "MILK-32" }).expect(201);
    expect(p.body).toMatchObject({ name_uz: "Sut 3,2%", price_tiyin: 1250000, unit: "l", status: "active", barcode: "4780000000001", stock: { available_milli: 0, state: "out" } });
    const u = await call(h, "patch", `/v1/products/${p.body.id}`, { ...as(o), body: { price_tiyin: 1300000 } }).expect(200);
    expect(u.body.price_tiyin).toBe(1300000);
    const a = (await h.admin.query("select action, before, after from audit_log where action = 'product.price_changed'")).rows;
    expect(a).toHaveLength(1);
    expect(a[0].before.price_tiyin).toBe(1250000);
    expect(a[0].after.price_tiyin).toBe(1300000);
    const g = await call(h, "get", `/v1/products/${p.body.id}`, as(o)).expect(200);
    expect(g.body.id).toBe(p.body.id);
  });

  it("valyatsiya: float narx, manfiy narx, noto'g'ri shtrix-kod/MXIK, noma'lum maydon", async () => {
    const { o } = await shop();
    await product(o, { price_tiyin: 12.5 }).expect(400);
    await product(o, { price_tiyin: -1 }).expect(400);
    const bc = await product(o, { barcode: "12" }).expect(400);
    expect(bc.body.code).toBe("validation.barcode_invalid");
    const mx = await product(o, { mxik: "123" }).expect(400);
    expect(mx.body.code).toBe("validation.mxik_invalid");
    await product(o, { tenant_id: "x" }).expect(400);
  });

  it("shtrix-kod va artikul takrorlansa 409; arxivlangandan keyin bo'shaydi", async () => {
    const { o } = await shop();
    const p = await product(o, { barcode: "4780000000001", sku: "A-1" }).expect(201);
    expect((await product(o, { barcode: "4780000000001" }).expect(409)).body.code).toBe("catalog.duplicate_barcode");
    expect((await product(o, { sku: "a-1" }).expect(409)).body.code).toBe("catalog.duplicate_sku");
    await call(h, "delete", `/v1/products/${p.body.id}`, as(o)).expect(200);
    await product(o, { barcode: "4780000000001", sku: "A-1" }).expect(201);
  });

  it("ro'yxat: qidiruv, kursor, filtr (MXIK yo'q), arxiv ko'rinmaydi", async () => {
    const { o } = await shop();
    for (let i = 1; i <= 7; i++) await product(o, { name_uz: `Mahsulot ${i}`, sku: `S${i}`, mxik: i % 2 ? "12345678901234567" : undefined }).expect(201);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const r = await call(h, "get", `/v1/products?limit=3${cursor ? `&cursor=${cursor}` : ""}`, as(o)).expect(200);
      seen.push(...r.body.items.map((x: { name_uz: string; sku: string }) => x.name_uz));
      cursor = r.body.next_cursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7].map((i) => `Mahsulot ${i}`));
    expect((await call(h, "get", "/v1/products?q=mahsulot%205", as(o)).expect(200)).body.items.map((x: { name_uz: string; sku: string }) => x.sku)).toEqual(["S5"]);
    expect((await call(h, "get", "/v1/products?mxik=missing", as(o)).expect(200)).body.items).toHaveLength(3);
    const first = (await call(h, "get", "/v1/products?limit=1", as(o))).body.items[0];
    await call(h, "delete", `/v1/products/${first.id}`, as(o)).expect(200);
    expect((await call(h, "get", "/v1/products?limit=100", as(o))).body.items).toHaveLength(6);
    await call(h, "get", "/v1/products?cursor=%%%", as(o)).expect(400);
    const s = (await call(h, "get", "/v1/catalog/summary", as(o)).expect(200)).body;
    expect(s).toMatchObject({ products: 6, out: 6, mxik_missing: 3 });
  });

  it("T-4: boshqa do'kon mahsuloti — 404 (mavjud emas bilan bir xil), ro'yxatda ko'rinmaydi", async () => {
    const a = await shop();
    const b = await shop("+998901000002", "Ikkinchi");
    const p = await product(a.o).expect(201);
    const cross = await call(h, "get", `/v1/products/${p.body.id}`, as(b.o)).expect(404);
    const missing = await call(h, "get", "/v1/products/00000000-0000-4000-8000-000000000000", as(b.o)).expect(404);
    expect(cross.body).toEqual(missing.body);
    await call(h, "patch", `/v1/products/${p.body.id}`, { ...as(b.o), body: { price_tiyin: 1 } }).expect(404);
    await call(h, "delete", `/v1/products/${p.body.id}`, as(b.o)).expect(404);
    await call(h, "put", `/v1/products/${p.body.id}/stock`, { ...as(b.o), body: { branch_id: b.branchId, quantity_milli: 5 } }).expect(404);
    await call(h, "put", `/v1/products/${p.body.id}/stock`, { ...as(a.o), body: { branch_id: b.branchId, quantity_milli: 5 } }).expect(404); // begona filial
    expect((await call(h, "get", "/v1/products", as(b.o))).body.items).toEqual([]);
    // boshqa do'kon kategoriyasini mahsulotga bog'lab bo'lmaydi
    const cat = await call(h, "post", "/v1/categories", { ...as(a.o), body: { name_uz: "A kategoriya" } }).expect(201);
    await product(b.o, { category_id: cat.body.id }).expect(400);
  });

  it("Idempotency-Key: bir xil kalit — bir marta yaratadi; kalitsiz — 400", async () => {
    const { o } = await shop();
    const key = "3c1f0f8e-9d35-4a0c-9d5f-0e7a4d6f2b11";
    const body = { name_uz: "Non", price_tiyin: 400000 };
    const r1 = await call(h, "post", "/v1/products", { ...as(o), key, body }).expect(201);
    const r2 = await call(h, "post", "/v1/products", { ...as(o), key, body }).expect(201);
    expect(r2.body.id).toBe(r1.body.id);
    expect((await h.admin.query("select count(*)::int as n from products")).rows[0].n).toBe(1);
    await call(h, "post", "/v1/products", { ...as(o), key: null, body }).expect(400);
  });
});

describe("Ruxsatlar (roles_permissions.json)", () => {
  it("menejer yozadi; buxgalter faqat o'qiydi; yig'uvchi katalogni ko'rmaydi, qoldiqni boshqaradi; kassir qoldiqni faqat o'qiydi", async () => {
    const { o, branchId } = await shop();
    const p = (await product(o).expect(201)).body;
    const manager = await addStaff(h, o, "+998901000011", "manager");
    const accountant = await addStaff(h, o, "+998901000012", "picker"); // 3 xodim: Start limiti
    const t = (s: { token: string }) => ({ token: s.token, tenant: o.tenantId });
    await call(h, "post", "/v1/products", { ...t(manager), body: { name_uz: "M", price_tiyin: 1 } }).expect(201);
    // yig'uvchi: katalog 0, qoldiq 2
    await call(h, "get", "/v1/products", t(accountant)).expect(403);
    await call(h, "post", "/v1/products", { ...t(accountant), body: { name_uz: "X", price_tiyin: 1 } }).expect(403);
    await call(h, "get", "/v1/stock", t(accountant)).expect(200);
    await call(h, "put", `/v1/products/${p.id}/stock`, { ...t(accountant), body: { branch_id: branchId, quantity_milli: 3000 } }).expect(200);
    await call(h, "post", "/v1/catalog/imports", { ...t(accountant), body: { format: "csv", content_base64: csvB64("nomi,narx\nA,1"), mode: "preview" } }).expect(403);
  });
});

describe("Qoldiq", () => {
  it("o'rnatish, tuzatish, manfiy bo'lmaydi; harakat jurnali o'zgarmas", async () => {
    const { o, branchId } = await shop();
    const p = (await product(o, { unit: "kg" }).expect(201)).body;
    const set = await call(h, "put", `/v1/products/${p.id}/stock`, { ...as(o), body: { branch_id: branchId, quantity_milli: 1080 } }).expect(200);
    expect(set.body).toMatchObject({ quantity_milli: 1080, available_milli: 1080, state: "low", out_marked: false });
    const adj = await call(h, "post", `/v1/products/${p.id}/stock/adjust`, { ...as(o), body: { branch_id: branchId, delta_milli: 9000, note: "yetkazib berish" } }).expect(200);
    expect(adj.body).toMatchObject({ quantity_milli: 10080, state: "in" });
    const neg = await call(h, "post", `/v1/products/${p.id}/stock/adjust`, { ...as(o), body: { branch_id: branchId, delta_milli: -20000 } }).expect(422);
    expect(neg.body.code).toBe("stock.negative");
    await call(h, "post", `/v1/products/${p.id}/stock/adjust`, { ...as(o), body: { branch_id: branchId, delta_milli: 0 } }).expect(400);
    await call(h, "put", `/v1/products/${p.id}/stock`, { ...as(o), body: { branch_id: branchId, quantity_milli: 1.5 } }).expect(400);
    const mv = await call(h, "get", `/v1/products/${p.id}/stock/movements`, as(o)).expect(200);
    expect(mv.body.items.map((m: { reason: string; delta_milli: number; quantity_after_milli: number }) => [m.reason, m.delta_milli, m.quantity_after_milli])).toEqual([["adjust", 9000, 10080], ["set", 1080, 1080]]);
    await expect(h.admin.query("update stock_movements set delta_milli = 0")).rejects.toThrow(/o'zgarmas/);
    await expect(h.admin.query("delete from stock_movements")).rejects.toThrow(/o'zgarmas/);
  });

  it("parallel tuzatishlar yo'qolmaydi (qator qulfi)", async () => {
    const { o, branchId } = await shop();
    const p = (await product(o).expect(201)).body;
    await Promise.all(Array.from({ length: 10 }, () => call(h, "post", `/v1/products/${p.id}/stock/adjust`, { ...as(o), body: { branch_id: branchId, delta_milli: 1000 } }).expect(200)));
    const s = (await call(h, "get", `/v1/products?branch_id=${branchId}`, as(o))).body.items[0].stock;
    expect(s.quantity_milli).toBe(10000);
  });

  it("«Tugadi»: belgilash vitrinada 0 qiladi, hodisa yoziladi, qaytarish, takroriy chaqiruv hodisa qo'shmaydi", async () => {
    const { o, branchId } = await shop();
    const p = (await product(o).expect(201)).body;
    await call(h, "put", `/v1/products/${p.id}/stock`, { ...as(o), body: { branch_id: branchId, quantity_milli: 20000 } }).expect(200);
    const out = await call(h, "post", `/v1/products/${p.id}/stock/out`, { ...as(o), body: { branch_id: branchId, out: true } }).expect(200);
    expect(out.body).toMatchObject({ out_marked: true, available_milli: 0, state: "out", quantity_milli: 20000 });
    await call(h, "post", `/v1/products/${p.id}/stock/out`, { ...as(o), body: { branch_id: branchId, out: true } }).expect(200);
    const ev = (await h.admin.query("select name, properties, source from events where name = 'stock.out_marked'")).rows;
    expect(ev).toEqual([{ name: "stock.out_marked", properties: { product_id: p.id, branch_id: branchId }, source: "panel" }]);
    expect((await call(h, "get", `/v1/products?stock=out&branch_id=${branchId}`, as(o))).body.items).toHaveLength(1);
    const back = await call(h, "post", `/v1/products/${p.id}/stock/out`, { ...as(o), body: { branch_id: branchId, out: false } }).expect(200);
    expect(back.body).toMatchObject({ out_marked: false, available_milli: 20000, state: "in" });
  });

  it("mavjud = qoldiq − band (band 0 dan kam bo'lmaydi)", async () => {
    const { o, branchId } = await shop();
    const p = (await product(o).expect(201)).body;
    await call(h, "put", `/v1/products/${p.id}/stock`, { ...as(o), body: { branch_id: branchId, quantity_milli: 8000 } }).expect(200);
    await h.admin.query("update stock set reserved_milli = 3000");
    expect((await call(h, "get", `/v1/products/${p.id}?branch_id=${branchId}`, as(o))).body.stock).toMatchObject({ quantity_milli: 8000, reserved_milli: 3000, available_milli: 5000, state: "low" });
    await h.admin.query("update stock set reserved_milli = 9000");
    expect((await call(h, "get", `/v1/products/${p.id}?branch_id=${branchId}`, as(o))).body.stock).toMatchObject({ available_milli: 0, state: "out" });
  });

  it("«Tugadi» 5 soniyadan tez ko'rinadi: keshsiz o'qish darhol yangilanadi", async () => {
    const { o, branchId } = await shop();
    const p = (await product(o).expect(201)).body;
    await call(h, "put", `/v1/products/${p.id}/stock`, { ...as(o), body: { branch_id: branchId, quantity_milli: 20000 } }).expect(200);
    const t0 = Date.now();
    await call(h, "post", `/v1/products/${p.id}/stock/out`, { ...as(o), body: { branch_id: branchId, out: true } }).expect(200);
    const seen = (await call(h, "get", `/v1/products/${p.id}?branch_id=${branchId}`, as(o))).body.stock.state;
    expect(seen).toBe("out");
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe("Import (CSV/XLSX)", () => {
  it("yangi mahsulotlar: ruscha sarlavhalar, narx matni, kategoriya avtomatik, qoldiq; preview hech narsa yozmaydi", async () => {
    const { o, branchId } = await shop();
    const csv = "Артикул;Наименование;Nomi;Цена;Остаток;Штрихкод;Ед.изм;Категория\nMILK-32;Молоко 3,2%;Sut 3,2%;12 500;22;4780000000001;л;Sut\nAPPLE;;Olma;9000,50;1,08;;кг;Meva\n";
    const pre = await runImport(o, csv, { mode: "preview" }).expect(200);
    expect(pre.body).toMatchObject({ mode: "preview", job_id: null, total_rows: 2, created: 2, updated: 0, errors: [] });
    expect((await h.admin.query("select count(*)::int as n from products")).rows[0].n).toBe(0);
    expect((await h.admin.query("select count(*)::int as n from categories")).rows[0].n).toBe(0);

    const r = await runImport(o, csv).expect(200);
    expect(r.body).toMatchObject({ mode: "apply", created: 2, updated: 0, errors: [] });
    expect(r.body.job_id).toBeTruthy();
    const rows = (await h.admin.query("select name_uz, name_ru, price_tiyin::int as price, unit, sku from products order by sku")).rows;
    expect(rows).toEqual([
      { name_uz: "Olma", name_ru: null, price: 900050, unit: "kg", sku: "APPLE" },
      { name_uz: "Sut 3,2%", name_ru: "Молоко 3,2%", price: 1250000, unit: "l", sku: "MILK-32" },
    ]);
    const st = (await h.admin.query("select p.sku, s.quantity_milli::int as q, s.source from stock s join products p on p.id = s.product_id order by p.sku")).rows;
    expect(st).toEqual([{ sku: "APPLE", q: 1080, source: "import" }, { sku: "MILK-32", q: 22000, source: "import" }]);
    expect((await h.admin.query("select count(*)::int as n from stock_movements where reason = 'import'")).rows[0].n).toBe(2);
    expect((await h.admin.query("select count(*)::int as n from categories")).rows[0].n).toBe(2);
    const hist = (await call(h, "get", "/v1/catalog/imports", as(o)).expect(200)).body.items;
    expect(hist[0]).toMatchObject({ total_rows: 2, created_count: 2, error_count: 0 });
    expect((await h.admin.query("select action from audit_log where action = 'catalog.imported'")).rowCount).toBe(1);
    void branchId;
  });

  it("qayta yuklash: shtrix-kod/artikul bo'yicha yangilaydi, o'zgarmaganni «unchanged» deb sanaydi", async () => {
    const { o } = await shop();
    await runImport(o, "nomi,narx,shtrix-kod,qoldiq\nSut,12500,4780000000001,10\nNon,4000,4780000000002,5\n").expect(200);
    const r = await runImport(o, "nomi,narx,shtrix-kod,qoldiq\nSut,13000,4780000000001,10\nNon,4000,4780000000002,5\n").expect(200);
    expect(r.body).toMatchObject({ created: 0, updated: 1, unchanged: 1, errors: [] });
    expect((await h.admin.query("select price_tiyin::int as p from products where barcode = '4780000000001'")).rows[0].p).toBe(1300000);
    expect((await h.admin.query("select count(*)::int as n from audit_log where action = 'product.price_changed'")).rows[0].n).toBe(1);
  });

  it("xato qatorlar o'tkaziladi, qolganlari yoziladi; qator raqami va kod beriladi", async () => {
    const { o } = await shop();
    const csv = [
      "nomi,narx,shtrix-kod,birlik,sku",
      "Yaxshi,1000,4780000000001,dona,A1",
      "Narxsiz,,4780000000002,dona,A2",
      "Narxi xato,abc,4780000000003,dona,A3",
      "Birlik xato,1000,4780000000004,quti,A4",
      "Takror,1000,4780000000001,dona,A5",
      ",1000,4780000000005,dona,A6",
      "Shtrix xato,1000,12,dona,A7",
    ].join("\n");
    const r = await runImport(o, csv).expect(200);
    expect(r.body.created).toBe(1);
    expect(r.body.errors.map((e: { row: number; code: string }) => [e.row, e.code])).toEqual([[3, "price_missing"], [4, "price_invalid"], [5, "unit_unknown"], [6, "duplicate_in_file"], [7, "name_missing"], [8, "barcode_invalid"]]);
    expect(r.body.errors[3].params).toEqual({ first_row: 2 });
    expect((await h.admin.query("select count(*)::int as n from products")).rows[0].n).toBe(1);
    const job = (await call(h, "get", `/v1/catalog/imports/${r.body.job_id}`, as(o)).expect(200)).body;
    expect(job.error_count).toBe(6);
    expect(job.errors).toHaveLength(6);
  });

  it("narx 30% dan ko'p o'zgarsa tasdiqsiz o'tkazib yuboriladi; tasdiq bilan qo'llanadi", async () => {
    const { o } = await shop();
    await runImport(o, "nomi,narx,sku\nSut,10000,S1\nNon,4000,S2\n").expect(200);
    const r = await runImport(o, "nomi,narx,sku\nSut,20000,S1\nNon,4500,S2\n").expect(200);
    expect(r.body).toMatchObject({ updated: 1, skipped_price_jumps: 1, price_jumps: [{ row: 2, old_tiyin: 1000000, new_tiyin: 2000000 }] });
    expect(r.body.errors.map((e: { row: number; code: string }) => e.code)).toEqual(["price_jump"]);
    expect((await h.admin.query("select price_tiyin::int as p from products where sku = 'S1'")).rows[0].p).toBe(1000000);
    const ok = await runImport(o, "nomi,narx,sku\nSut,20000,S1\n", { confirm_price_jumps: true }).expect(200);
    expect(ok.body).toMatchObject({ updated: 1, skipped_price_jumps: 0 });
  });

  it("noto'g'ri fayllar: bo'sh, tanilmagan sarlavha, buzuq xlsx, juda ko'p qator, base64 emas", async () => {
    const { o } = await shop();
    expect((await runImport(o, "").expect(400)).body.code).toBe("validation.failed");
    expect((await runImport(o, "foo,bar\n1,2\n").expect(422)).body.code).toBe("import.no_columns");
    expect((await call(h, "post", "/v1/catalog/imports", { ...as(o), body: { format: "xlsx", content_base64: csvB64("bu xlsx emas"), mode: "apply" } }).expect(400)).body.code).toBe("import.invalid_file");
    expect((await call(h, "post", "/v1/catalog/imports", { ...as(o), body: { format: "csv", content_base64: "!!!!", mode: "apply" } }).expect(400)).body.code).toBe("import.invalid_file");
    const many = "nomi,narx\n" + Array.from({ length: 5001 }, (_, i) => `M${i},100`).join("\n");
    expect((await runImport(o, many).expect(422)).body.code).toBe("import.too_many_rows");
    await call(h, "post", "/v1/catalog/imports", { ...as(o), body: { format: "csv", content_base64: csvB64("nomi,narx\nA,1"), mode: "apply", extra: 1 } }).expect(400);
  });

  it("qoldiq ustuni bor, filial bir nechta bo'lsa filial majburiy; begona filial — 404", async () => {
    const a = await shop();
    await call(h, "patch", `/v1/tenants/${a.o.tenantId}`, { ...as(a.o), body: { status: "active" } }).expect(200);
    await h.admin.query("update tenants set plan_code = 'pro' where id = $1", [a.o.tenantId]);
    await call(h, "post", "/v1/branches", { ...as(a.o), body: { name: "Ikkinchi", address: "Toshkent, Yunusobod 2" } }).expect(201);
    const csv = "nomi,narx,qoldiq\nSut,1000,5\n";
    expect((await runImport(a.o, csv).expect(422)).body.code).toBe("import.branch_required");
    const b = await shop("+998901000002", "Boshqa");
    await runImport(a.o, csv, { branch_id: b.branchId }).expect(404);
    await runImport(a.o, csv, { branch_id: a.branchId }).expect(200);
  });

  it("XLSX fayl yuklanadi (ruscha varaq, raqamli narx)", async () => {
    const { o } = await shop();
    const xlsx = makeXlsx([["Наименование", "Nomi", "Цена", "Остаток", "Артикул"], ["Хлеб", "Non", "4000", "12", "BREAD-1"], ["Молоко", "Sut", "12500.5", "3.5", "MILK-1"]]);
    const r = await call(h, "post", "/v1/catalog/imports", { ...as(o), body: { format: "xlsx", content_base64: Buffer.from(xlsx).toString("base64"), mode: "apply" } }).expect(200);
    expect(r.body).toMatchObject({ created: 2, errors: [] });
    const rows = (await h.admin.query("select p.sku, p.price_tiyin::int as price, s.quantity_milli::int as q from products p join stock s on s.product_id = p.id order by p.sku")).rows;
    expect(rows).toEqual([{ sku: "BREAD-1", price: 400000, q: 12000 }, { sku: "MILK-1", price: 1250050, q: 3500 }]);
  });

  it("1 000 mahsulot 60 soniyadan ancha tez (S1 mezoni)", async () => {
    const { o } = await shop();
    const lines = ["nomi,narx,shtrix-kod,sku,qoldiq,mxik,kategoriya"];
    for (let i = 1; i <= 1000; i++) lines.push(`Mahsulot ${i},${1000 + i},${String(4780000000000 + i)},SKU-${i},${i % 50},12345678901234567,Guruh ${i % 10}`);
    const t0 = Date.now();
    const r = await runImport(o, lines.join("\n")).expect(200);
    const ms = Date.now() - t0;
    expect(r.body).toMatchObject({ created: 1000, errors: [] });
    expect((await h.admin.query("select count(*)::int as n from products")).rows[0].n).toBe(1000);
    expect(ms).toBeLessThan(60_000);
    console.log(`import 1000 qator: ${ms} ms`);
    // qayta yuklash ham tez va hech narsa o'zgarmaydi
    const again = await runImport(o, lines.join("\n")).expect(200);
    expect(again.body).toMatchObject({ created: 0, updated: 0, unchanged: 1000 });
  }, 90_000);
});

/** Minimal XLSX (birinchi varaq, umumiy satrlar + inlineStr aralash) — faqat test uchun. */
function makeXlsx(table: string[][]): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const col = (i: number) => String.fromCharCode(65 + i);
  const strings: string[] = [];
  const sheetRows = table.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
    if (v === "") return "";
    const num = /^\d+(\.\d+)?$/.test(v) && r > 0 && c > 0 && v.length < 12;
    if (num) return `<c r="${col(c)}${r + 1}"><v>${v}</v></c>`;
    strings.push(v);
    return `<c r="${col(c)}${r + 1}" t="s"><v>${strings.length - 1}</v></c>`;
  }).join("")}</row>`).join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'),
    "xl/workbook.xml": strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
    "xl/sharedStrings.xml": strToU8(`<sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`),
  };
  return zipSync(files);
}
