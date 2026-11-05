import { createApp } from "./bootstrap";
import { loadConfig } from "./config";

async function main() {
  const cfg = loadConfig();
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(cfg.PORT, "0.0.0.0");
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : e}\n`);
  process.exit(1);
});
