import { Client } from "pg";

/** Demo hisoblar (OPEN_LOGIN rejimida parolsiz, faqat telefon bilan kiriladi). Hujjat: docs/00_boshlash/TEST_YOLLANMA.md */
export const DEMO_ACCOUNTS = [
  { role: "owner", phone: "+998901000001", name: "Egasi" },
  { role: "manager", phone: "+998901000002", name: "Menejer" },
  { role: "picker", phone: "+998901000003", name: "Yig'uvchi" },
  { role: "cashier", phone: "+998901000004", name: "Kassir" },
  { role: "dispatcher", phone: "+998901000005", name: "Dispetcher" },
  { role: "accountant", phone: "+998901000006", name: "Buxgalter" },
  { role: "marketer", phone: "+998901000007", name: "Marketolog" },
  { role: "courier", phone: "+998901000008", name: "Kuryer" },
] as const;
export const OTHER_OWNER = "+998901000009";
export const PLATFORM_ADMIN = "+998901000000";

const PRODUCTS: { sku: string; uz: string; ru: string; price: number; unit: "piece" | "kg" | "l"; cat: string; qty: number; mxik?: string; out?: boolean; barcode?: string }[] = [
  { sku: "MILK-32", uz: "Sut 3,2%", ru: "Молоко 3,2%", price: 1250000, unit: "l", cat: "Sut mahsulotlari", qty: 40000, mxik: "04401001001000000", barcode: "4780000000001" },
  { sku: "KEFIR-1", uz: "Kefir", ru: "Кефир", price: 1100000, unit: "l", cat: "Sut mahsulotlari", qty: 4000, barcode: "4780000000002" }, // kam qoldi
  { sku: "QATIQ-05", uz: "Qatiq", ru: "Катык", price: 800000, unit: "piece", cat: "Sut mahsulotlari", qty: 0, barcode: "4780000000003" }, // tugagan
  { sku: "BREAD-1", uz: "Non, tandir", ru: "Лепёшка тандырная", price: 500000, unit: "piece", cat: "Non", qty: 60000, barcode: "4780000000004" },
  { sku: "APPLE-KG", uz: "Olma, qizil", ru: "Яблоки красные", price: 2200000, unit: "kg", cat: "Meva-sabzavot", qty: 1080 }, // 1,08 kg
  { sku: "TOMATO-KG", uz: "Pomidor", ru: "Помидоры", price: 1800000, unit: "kg", cat: "Meva-sabzavot", qty: 25500, out: true }, // stop-list
  { sku: "BANANA-KG", uz: "Banan", ru: "Бананы", price: 2800000, unit: "kg", cat: "Meva-sabzavot", qty: 12000 },
  { sku: "WATER-15", uz: "Suv 1,5 l", ru: "Вода 1,5 л", price: 450000, unit: "piece", cat: "Ichimliklar", qty: 120000, barcode: "4780000000005" },
  { sku: "JUICE-1", uz: "Sharbat 1 l", ru: "Сок 1 л", price: 1500000, unit: "l", cat: "Ichimliklar", qty: 18000, barcode: "4780000000006" },
  { sku: "RICE-1", uz: "Guruch 1 kg", ru: "Рис 1 кг", price: 2400000, unit: "piece", cat: "Bakaleya", qty: 33000, barcode: "4780000000007" },
  { sku: "OIL-1", uz: "Yog' 1 l", ru: "Масло 1 л", price: 2900000, unit: "piece", cat: "Bakaleya", qty: 5000, barcode: "4780000000008" },
  { sku: "TEA-100", uz: "Choy 100 g", ru: "Чай 100 г", price: 1900000, unit: "piece", cat: "Bakaleya", qty: 9000, mxik: "09021000001000000" },
];

/** Idempotent: demo do'kon (STIR 200000001) bor bo'lsa hech narsa qilmaydi. `url` — jadval egasi/superuser (RLS'ni chetlab o'tadi). */
export async function seedDemo(url: string): Promise<{ created: boolean }> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    if ((await c.query("select 1 from tenants where tin = '200000001'")).rowCount) return { created: false };
    await c.query("begin");
    const user = async (phone: string, admin = false) =>
      (await c.query<{ id: string }>("insert into users (phone, is_platform_admin, last_seen_at) values ($1,$2,now()) on conflict (phone) do update set is_platform_admin = users.is_platform_admin or excluded.is_platform_admin returning id", [phone, admin])).rows[0]!.id;
    const plan = async (code: string) => (await c.query<{ version: number }>("select version from plans where code = $1 and status = 'published' order by version desc limit 1", [code])).rows[0]!.version;

    await user(PLATFORM_ADMIN, true);
    const tarmoq = await plan("tarmoq");
    const tid = (await c.query<{ id: string }>("insert into tenants (name, tin, status, plan_code, plan_version) values ('Demo Do''kon','200000001','active','tarmoq',$1) returning id", [tarmoq])).rows[0]!.id;
    const b1 = (await c.query<{ id: string }>("insert into branches (tenant_id, name, address, lat, lng) values ($1,'Markaziy filial','Toshkent, Chilonzor 1',41.2856,69.2037) returning id", [tid])).rows[0]!.id;
    await c.query("insert into branches (tenant_id, name, address, lat, lng) values ($1,'Yunusobod filiali','Toshkent, Yunusobod 4',41.3646,69.2878)", [tid]);
    for (const a of DEMO_ACCOUNTS) {
      const uid = await user(a.phone);
      await c.query("insert into memberships (tenant_id, user_id, role) values ($1,$2,$3) on conflict do nothing", [tid, uid, a.role]);
    }
    const cats = new Map<string, string>();
    let sort = 0;
    for (const p of PRODUCTS) {
      if (!cats.has(p.cat)) cats.set(p.cat, (await c.query<{ id: string }>("insert into categories (tenant_id, name_uz, sort) values ($1,$2,$3) returning id", [tid, p.cat, sort++])).rows[0]!.id);
      const pid = (await c.query<{ id: string }>(
        "insert into products (tenant_id, category_id, name_uz, name_ru, sku, barcode, mxik, unit, price_tiyin) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
        [tid, cats.get(p.cat), p.uz, p.ru, p.sku, p.barcode ?? null, p.mxik ?? null, p.unit, p.price])).rows[0]!.id;
      await c.query("insert into stock (product_id, branch_id, tenant_id, quantity_milli, out_marked, source) values ($1,$2,$3,$4,$5,'system')", [pid, b1, tid, p.qty, p.out ?? false]);
      await c.query("insert into stock_movements (tenant_id, product_id, branch_id, delta_milli, quantity_after_milli, reason, source) values ($1,$2,$3,$4,$4,'set','system')", [tid, pid, b1, p.qty]);
    }

    // Ikkinchi, begona do'kon: ma'lumotlar izolyatsiyasini (404) tekshirish uchun
    const otherUser = await user(OTHER_OWNER);
    const t2 = (await c.query<{ id: string }>("insert into tenants (name, tin, status, plan_code, plan_version) values ('Boshqa Do''kon','200000002','active','start',$1) returning id", [await plan("start")])).rows[0]!.id;
    await c.query("insert into memberships (tenant_id, user_id, role) values ($1,$2,'owner')", [t2, otherUser]);
    const b2 = (await c.query<{ id: string }>("insert into branches (tenant_id, name, address) values ($1,'Asosiy','Samarqand, Registon 1') returning id", [t2])).rows[0]!.id;
    const p2 = (await c.query<{ id: string }>("insert into products (tenant_id, name_uz, sku, price_tiyin) values ($1,'Boshqa do''kon mahsuloti','OTHER-1',999900) returning id", [t2])).rows[0]!.id;
    await c.query("insert into stock (product_id, branch_id, tenant_id, quantity_milli, source) values ($1,$2,$3,5000,'system')", [p2, b2, t2]);
    await c.query("commit");
    return { created: true };
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}
