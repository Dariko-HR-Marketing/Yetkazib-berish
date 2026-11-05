import { Client } from "pg";
import { loadConfig } from "../config";
import { migrate } from "./migrate";
import { seed } from "./seed";

/** Faqat dev/e2e: sxemani tozalab, noldan migratsiya + seed. Productionda rad etiladi. */
async function main() {
  const cfg = loadConfig();
  if (cfg.NODE_ENV === "production") throw new Error("Productionda reset taqiqlangan");
  const c = new Client({ connectionString: cfg.DATABASE_URL });
  await c.connect();
  await c.query("drop schema if exists public cascade; create schema public; grant usage on schema public to public;");
  await c.end();
  await migrate(cfg.DATABASE_URL, cfg.APP_DB_PASSWORD);
  await seed(cfg.DATABASE_URL);
  process.stdout.write("DB tayyor\n");
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
