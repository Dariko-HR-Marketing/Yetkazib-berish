import { loadConfig } from "../config";
import { migrate } from "./migrate";
import { seed } from "./seed";

async function main() {
  const cfg = loadConfig();
  const applied = await migrate(cfg.DATABASE_URL, cfg.APP_DB_PASSWORD);
  await seed(cfg.DATABASE_URL);
  process.stdout.write(`Migratsiyalar: ${applied.length ? applied.join(", ") : "yangisi yo'q"}\nSeed: tayyor\n`);
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
