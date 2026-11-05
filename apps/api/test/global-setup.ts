import { Client } from "pg";
import { migrate } from "../src/db/migrate";
import { seed } from "../src/db/seed";

/** Test bazasi har ishga tushirishda noldan quriladi (migratsiyalar + seed), shunda migratsiyalarning o'zi ham tekshiriladi. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://dostavka:dostavka@127.0.0.1:5432/dostavka_test";
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("drop schema if exists public cascade; create schema public; grant usage on schema public to public;");
  await c.end();
  await migrate(url, "dostavka_app");
  await seed(url);
}
