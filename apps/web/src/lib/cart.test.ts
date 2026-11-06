import { describe, expect, it } from "vitest";
import { cartTotal, lineTotal, stepOf } from "./cart";

describe("savat hisob-kitobi (server bilan bir xil)", () => {
  it("lineTotal yarim yuqoriga yaxlitlaydi, float yo'q", () => {
    expect(lineTotal(1080, 2200000)).toBe(2376000);
    expect(lineTotal(1500, 333)).toBe(500);
    expect(lineTotal(1000, 1250000)).toBe(1250000);
  });
  it("cartTotal va qadam", () => {
    const c = { branch_id: "b", lines: [
      { id: "1", name_uz: "Olma", name_ru: null, unit: "kg" as const, price_tiyin: 2200000, quantity_milli: 1080 },
      { id: "2", name_uz: "Non", name_ru: null, unit: "piece" as const, price_tiyin: 500000, quantity_milli: 3000 } ] };
    expect(cartTotal(c)).toBe(2376000 + 1500000);
    expect(stepOf("piece")).toBe(1000);
    expect(stepOf("kg")).toBe(500);
  });
});
