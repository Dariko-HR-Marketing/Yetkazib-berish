import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";

export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? resolve(__dirname, "../../../../infra/migrations");

/** Faqat oldinga ketadigan migratsiyalar. Har fayl bitta tranzaksiyada; checksum o'zgarsa — to'xtaydi. */
export async function migrate(databaseUrl: string, appPassword: string, dir = MIGRATIONS_DIR): Promise<string[]> {
  const c = new Client({ connectionString: databaseUrl });
  await c.connect();
  const applied: string[] = [];
  try {
    await c.query(`create table if not exists schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    const done = new Map((await c.query<{ name: string; checksum: string }>("select name, checksum from schema_migrations")).rows.map((r) => [r.name, r.checksum]));
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(dir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      if (done.has(file)) {
        if (done.get(file) !== checksum) throw new Error(`Migratsiya o'zgartirilgan: ${file} (yangi fayl qo'shing)`);
        continue;
      }
      await c.query("begin");
      try {
        await c.query(sql);
        await c.query("insert into schema_migrations (name, checksum) values ($1, $2)", [file, checksum]);
        await c.query("commit");
      } catch (e) {
        await c.query("rollback");
        throw new Error(`Migratsiya xatosi (${file}): ${(e as Error).message}`);
      }
      applied.push(file);
    }
    // Ilova roliga login va parol (har safar; sir repoda emas).
    await c.query(`alter role dostavka_app login password ${c.escapeLiteral(appPassword)}`);
  } finally {
    await c.end();
  }
  return applied;
}
