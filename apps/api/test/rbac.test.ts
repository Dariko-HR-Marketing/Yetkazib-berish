import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AREAS, hasPermission, MFA_ROLES, permissionsOf, ROLE_KEYS } from "../src/common/rbac";

const json = JSON.parse(readFileSync(resolve(__dirname, "../../../docs/05_spetsifikatsiya_json/roles_permissions.json"), "utf8")) as {
  roles: { key: string }[]; permissions: { area: string; by_role: Record<string, number> }[];
};

describe("roles_permissions.json <-> RBAC", () => {
  it("8 rol × 12 soha", () => {
    expect(json.roles.map((r) => r.key)).toEqual([...ROLE_KEYS]);
    expect(json.permissions).toHaveLength(AREAS.length);
  });

  it("matritsadagi har daraja (0/1/2) ruxsatga to'g'ri aylanadi", () => {
    json.permissions.forEach((p, i) => {
      const area = AREAS[i]!;
      for (const role of ROLE_KEYS.filter((r) => r !== "courier")) {
        const level = p.by_role[role]!;
        expect(hasPermission(role, `${area}:read`), `${role} ${area}:read`).toBe(level >= 1);
        expect(hasPermission(role, `${area}:write`), `${role} ${area}:write`).toBe(level >= 2);
      }
    });
  });

  it("kuryer panel ruxsatlariga ega emas (faqat kuryer ilovasi)", () => {
    expect(permissionsOf("courier").size).toBe(0);
  });

  it("faqat egasi do'kon va kalitlarni boshqaradi; 2FA — egasi va buxgalter", () => {
    for (const role of ROLE_KEYS) {
      expect(hasPermission(role, "tenant:manage")).toBe(role === "owner");
      expect(hasPermission(role, "features:toggle")).toBe(role === "owner");
    }
    expect([...MFA_ROLES].sort()).toEqual(["accountant", "owner"]);
  });

  it("noma'lum rol hech narsaga ega emas", () => {
    expect(hasPermission("hacker", "team:read")).toBe(false);
  });
});
