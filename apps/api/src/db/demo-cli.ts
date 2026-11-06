import { loadConfig } from "../config";
import { DEMO_ACCOUNTS, OTHER_OWNER, PLATFORM_ADMIN, seedDemo } from "./demo-seed";

async function main() {
  const cfg = loadConfig();
  const r = await seedDemo(cfg.DATABASE_URL);
  process.stdout.write(r.created ? "Demo ma'lumotlar yaratildi\n" : "Demo ma'lumotlar allaqachon bor\n");
  for (const a of DEMO_ACCOUNTS) process.stdout.write(`  ${a.role.padEnd(11)} ${a.phone}\n`);
  process.stdout.write(`  begona do'kon egasi ${OTHER_OWNER}; platforma admini ${PLATFORM_ADMIN}\n`);
}
main().catch((e) => { process.stderr.write(String(e) + "\n"); process.exit(1); });
