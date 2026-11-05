import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

const html = (md: string) => renderToStaticMarkup(<Markdown source={md} />);

describe("Markdown (xavfsiz render)", () => {
  it("sarlavha, paragraf, ro'yxat, qalin matn", () => {
    const out = html("# Sarlavha\n\n1.1. **Sotuvchi** — do'kon.\n\n- bir\n- ikki\n");
    expect(out).toContain("<h1");
    expect(out).toContain("<strong>Sotuvchi</strong>");
    expect(out).toContain("<ul");
    expect(out.match(/<li>/g)).toHaveLength(2);
  });

  it("jadval", () => {
    const out = html("| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |");
    expect(out).toContain("<table");
    expect(out.match(/<th /g)).toHaveLength(2);
    expect(out.match(/<td /g)).toHaveLength(4);
  });

  it("qochirilgan qavslar ochiladi: \\[nomi\\] -> [nomi]", () => {
    expect(html("Operator \\[nomi, STIR\\]")).toContain("[nomi, STIR]");
  });

  it("HTML va skript matn sifatida chiqadi (XSS yo'q)", () => {
    const out = html("<script>alert(1)</script> va <img src=x onerror=alert(1)>\n\n# <b>x</b>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });
});
