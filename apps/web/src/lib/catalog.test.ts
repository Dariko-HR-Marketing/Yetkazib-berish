import { describe, expect, it } from "vitest";
import { csvCell, formatQty, formatSom, parseQty, parseSom } from "./catalog";

describe("catalog yordamchilari", () => {
  it("parseSom", () => {
    expect(parseSom("12 500")).toBe(1250000);
    expect(parseSom("12500,50")).toBe(1250050);
    expect(parseSom("12.500")).toBe(1250000);
    expect(parseSom("0,07")).toBe(7);
    for (const bad of ["", "abc", "-1", "1,2,3"]) expect(parseSom(bad), bad).toBeNull();
  });
  it("formatSom", () => {
    expect(formatSom(1250000)).toBe("12 500");
    expect(formatSom(1250050)).toBe("12 500,50");
    expect(formatSom(7)).toBe("0,07");
    expect(formatSom(0)).toBe("0");
  });
  it("parseQty / formatQty qaytma-aylanish", () => {
    expect(parseQty("1,08")).toBe(1080);
    expect(parseQty("22")).toBe(22000);
    expect(parseQty("1,2345")).toBeNull();
    for (const n of [0, 5, 1080, 22000, 123456]) expect(parseQty(formatQty(n))).toBe(n);
    expect(formatQty(1080)).toBe("1,08");
    expect(formatQty(22000)).toBe("22");
  });
  it("csvCell formula in'ektsiyasidan himoyalaydi", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(5)).toBe("5");
  });
});
