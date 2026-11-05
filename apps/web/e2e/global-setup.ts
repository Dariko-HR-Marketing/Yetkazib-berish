import { execSync } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";
import { Client } from "pg";

const ENV_DB = process.env.E2E_DATABASE_URL ?? "postgresql://dostavka:dostavka@127.0.0.1:5432/dostavka_e2e";
const ENV_REDIS = process.env.E2E_REDIS_URL ?? "redis://127.0.0.1:6379/14";

/** Redis'ni tozalash (RESP, qo'shimcha bog'liqliksiz). */
async function flushRedis(url: string): Promise<void> {
  const u = new URL(url);
  const db = u.pathname.replace("/", "") || "0";
  await new Promise<void>((done, fail) => {
    const s = net.connect(Number(u.port || 6379), u.hostname, () => s.write(`*2\r\n$6\r\nSELECT\r\n$${db.length}\r\n${db}\r\n*1\r\n$7\r\nFLUSHDB\r\n`));
    let ok = 0;
    s.on("data", (d) => {
      ok += (d.toString().match(/\+OK/g) ?? []).length;
      if (ok >= 2) { s.end(); done(); }
    });
    s.on("error", fail);
  });
}

/** E2E bazasi: yaratiladi (bo'lmasa), keyin migratsiya + seed. */
export default async function globalSetup() {
  const admin = new Client({ connectionString: ENV_DB.replace(/\/[^/]+$/, "/postgres") });
  await admin.connect();
  const name = ENV_DB.split("/").pop()!;
  const ex = await admin.query("select 1 from pg_database where datname = $1", [name]);
  if (!ex.rowCount) await admin.query(`create database ${name}`);
  await admin.end();
  execSync("pnpm exec tsx src/db/reset-cli.ts", {
    cwd: resolve(__dirname, "../../api"),
    env: { ...process.env, NODE_ENV: "development", DATABASE_URL: ENV_DB, APP_DB_PASSWORD: "dostavka_app" },
    stdio: "inherit",
  });
  await flushRedis(ENV_REDIS);
}
