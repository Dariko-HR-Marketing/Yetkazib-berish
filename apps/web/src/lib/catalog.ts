/** Narx va miqdor yordamchilari. Float yo'q: matn belgilar bo'yicha butun songa (tiyin, mingdan bir) aylantiriladi. */
const clean = (s: string) => s.replace(/[\s\u00a0\u202f]/g, "");

/** «12 500», «12500,50» -> tiyin. Ming ajratgich: bo'shliq yoki «12.500». */
export function parseSom(raw: string): number | null {
  const s = clean(raw);
  let int: string; let frac = "";
  if (/^[0-9]{1,3}([.,][0-9]{3})+$/.test(s)) int = s.replace(/[.,]/g, "");
  else {
    const m = s.match(/^([0-9]+)(?:[.,]([0-9]{1,2}))?$/);
    if (!m) return null;
    int = m[1]!; frac = m[2] ?? "";
  }
  if (int.length > 12) return null;
  return Number(BigInt(int) * 100n + BigInt(frac.padEnd(2, "0") || "0"));
}

/** tiyin -> «12 500» yoki «12 500,50» (so'm). */
export function formatSom(tiyin: number): string {
  const som = Math.trunc(tiyin / 100);
  const rest = tiyin % 100;
  const grouped = String(som).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return rest ? `${grouped},${String(rest).padStart(2, "0")}` : grouped;
}

/** «1,08» -> 1080 (mingdan bir). */
export function parseQty(raw: string): number | null {
  const s = clean(raw);
  if (!/^[0-9]+([.,][0-9]{1,3})?$/.test(s)) return null;
  const [i, f = ""] = s.split(/[.,]/);
  if (i!.length > 12) return null;
  return Number(BigInt(i!) * 1000n + BigInt(f.padEnd(3, "0")));
}

/** 1080 -> «1,08»; 22000 -> «22». */
export function formatQty(milli: number): string {
  const i = Math.trunc(milli / 1000);
  const f = String(milli % 1000).padStart(3, "0").replace(/0+$/, "");
  return f ? `${i},${f}` : String(i);
}

/** Fayl -> base64 (katta fayllar uchun bo'laklab). */
export async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** CSV katagi: formula in'ektsiyasidan himoya (=, +, -, @ bilan boshlansa apostrof) va qo'shtirnoq. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
