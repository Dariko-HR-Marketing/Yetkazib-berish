import { unzipSync } from "fflate";

/** Float ishlatilmaydi (CLAUDE.md §3): matn belgilar bo'yicha butun songa aylantiriladi. */

const clean = (s: string) => s.replace(/[\s\u00a0\u202f]/g, "");

/** «12 500», «12500,50», «12.500» (ming ajratgich), «12500.5» -> tiyin. Noto'g'ri bo'lsa null. */
export function parsePriceTiyin(raw: string): number | null {
  const s = clean(raw);
  if (!/^[0-9.,]+$/.test(s)) return null;
  let intPart: string;
  let frac = "";
  if (/^[0-9]{1,3}([.,][0-9]{3})+$/.test(s)) intPart = s.replace(/[.,]/g, "");
  else {
    const m = s.match(/^([0-9]+)(?:[.,]([0-9]{1,2}))?$/);
    if (!m) return null;
    intPart = m[1]!;
    frac = m[2] ?? "";
  }
  if (intPart.length > 12) return null;
  const tiyin = BigInt(intPart) * 100n + BigInt(frac.padEnd(2, "0") || "0");
  return tiyin > 100_000_000_000n ? null : Number(tiyin);
}

/** «1,08» -> 1080 (mingdan bir). 3 xonagacha kasr. */
export function parseQuantityMilli(raw: string): number | null {
  const s = clean(raw);
  if (!/^[0-9]+([.,][0-9]{1,3})?$/.test(s)) return null;
  const [i, f = ""] = s.split(/[.,]/);
  if (i!.length > 12) return null;
  return Number(BigInt(i!) * 1000n + BigInt(f.padEnd(3, "0")));
}

// ---------------------------------------------------------------- CSV
/** RFC 4180; ajratgich `,` yoki `;` (birinchi qatordan aniqlanadi); BOM olib tashlanadi. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : (firstLine.includes("\t") ? "\t" : ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

// ---------------------------------------------------------------- XLSX
const MAX_UNZIPPED = 40 * 1024 * 1024;
const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const l = e.toLowerCase();
    if (l === "amp") return "&"; if (l === "lt") return "<"; if (l === "gt") return ">"; if (l === "quot") return '"'; if (l === "apos") return "'";
    const cp = l.startsWith("#x") ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
  });
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]!)).join("");
const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/[0-9]/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export class XlsxError extends Error {}

/** Birinchi varaq. Zip-bomba: ochilgan hajm chegaralanadi. */
export function parseXlsx(buf: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  let total = 0;
  try {
    files = unzipSync(buf, { filter: (f) => { total += f.originalSize; if (total > MAX_UNZIPPED) throw new XlsxError("too_large"); return /^xl\/(worksheets\/[^/]+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/.test(f.name); } });
  } catch (e) {
    if (e instanceof XlsxError) throw e;
    throw new XlsxError("not_xlsx");
  }
  const td = new TextDecoder();
  const get = (n: string) => (files[n] ? td.decode(files[n]) : null);
  const wb = get("xl/workbook.xml");
  const rels = get("xl/_rels/workbook.xml.rels");
  if (!wb || !rels) throw new XlsxError("not_xlsx");
  const firstSheet = wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const target = firstSheet ? [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${firstSheet}"`))?.match(/Target="([^"]+)"/)?.[1] : null;
  const sheetPath = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target}`) : "xl/worksheets/sheet1.xml";
  const sheet = get(sheetPath);
  if (!sheet) throw new XlsxError("not_xlsx");
  const sst = get("xl/sharedStrings.xml");
  const shared = sst ? [...sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!)) : [];

  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!;
      const ref = attrs.match(/\br="([A-Z]+)[0-9]+"/)?.[1];
      if (!ref) continue;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const body = cm[2] ?? "";
      let v = "";
      if (type === "s") v = shared[Number(body.match(/<v>([\s\S]*?)<\/v>/)?.[1])] ?? "";
      else if (type === "inlineStr") v = textOf(body);
      else v = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      const idx = colIndex(ref);
      while (row.length < idx) row.push("");
      row[idx] = v.trim();
    }
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}
