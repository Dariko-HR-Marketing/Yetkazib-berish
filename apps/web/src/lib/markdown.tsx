import type { ReactNode } from "react";

/**
 * Xavfsiz minimal markdown -> React (dangerouslySetInnerHTML yo'q: HTML matn sifatida chiqadi).
 * Qo'llab-quvvatlanadi: #..### sarlavha, paragraf, "- " ro'yxat, **qalin**, jadval (| a | b |), \[ \] qochirilgan qavslar.
 */
const unescape = (s: string) => s.replace(/\\([\\[\]()*_#.-])/g, "$1");

function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) out.push(<strong key={`${key}-${i}`}>{unescape(p.slice(2, -2))}</strong>);
    else if (p) out.push(unescape(p));
  });
  return out;
}

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1]!.length;
      const cls = lvl === 1 ? "mt-2 mb-4 text-title font-extrabold md:text-h2" : lvl === 2 ? "mt-8 mb-3 text-title-sm font-extrabold" : "mt-6 mb-2 text-body-lg font-bold";
      const Tag = (`h${lvl}`) as "h1" | "h2" | "h3";
      nodes.push(<Tag key={k++} className={cls}>{inline(h[2]!, `h${k}`)}</Tag>);
      i++; continue;
    }
    if (isRow(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1]!)) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i]!)) { rows.push(cells(lines[i]!)); i++; }
      nodes.push(
        <div key={k++} className="my-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-body">
            <thead><tr>{head.map((c, j) => <th key={j} className="border-b border-line-strong bg-bg px-3 py-2 font-bold">{inline(c, `th${k}${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j} className="border-b border-line-soft px-3 py-2 align-top">{inline(c, `td${k}${a}${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) { items.push(lines[i]!.replace(/^\s*[-*]\s+/, "")); i++; }
      nodes.push(<ul key={k++} className="my-3 list-disc space-y-1 pl-6">{items.map((t, j) => <li key={j}>{inline(t, `li${k}${j}`)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3})\s+/.test(lines[i]!) && !/^\s*[-*]\s+/.test(lines[i]!) && !isRow(lines[i]!)) { para.push(lines[i]!); i++; }
    nodes.push(<p key={k++} className="my-3 leading-relaxed">{inline(para.join(" "), `p${k}`)}</p>);
  }
  return <>{nodes}</>;
}
