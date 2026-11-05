// CI byudjet tekshiruvi: har marshrutning birinchi yuklanishidagi JS (gzip) <= 170 KB (CLAUDE.md §6).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const BUDGET = 170 * 1024;
const dist = process.env.NEXT_DIST_DIR ?? ".next";
const manifest = JSON.parse(readFileSync(join(dist, "app-build-manifest.json"), "utf8"));
const cache = new Map();
const size = (f) => {
  if (!cache.has(f)) cache.set(f, gzipSync(readFileSync(join(dist, f))).length);
  return cache.get(f);
};

let failed = false;
for (const [route, files] of Object.entries(manifest.pages)) {
  const js = [...new Set(files)].filter((f) => f.endsWith(".js"));
  const total = js.reduce((a, f) => a + size(f), 0);
  const ok = total <= BUDGET;
  failed ||= !ok;
  process.stdout.write(`${ok ? "OK  " : "FAIL"} ${route.padEnd(36)} ${(total / 1024).toFixed(1)} KB gzip (byudjet 170 KB)\n`);
}
if (failed) { process.stderr.write("JS byudjeti oshib ketdi\n"); process.exit(1); }
