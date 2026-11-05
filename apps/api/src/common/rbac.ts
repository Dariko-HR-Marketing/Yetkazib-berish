import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SEED_DIR = process.env.SEED_DIR ?? resolve(__dirname, "../../../../infra/seed");

/** roles_permissions.json dagi 12 soha (tartib bilan). Kalit: `<soha>:read|write`. */
export const AREAS = ["orders", "picking", "dispatch", "catalog", "stock", "cash", "finance", "loyalty", "analytics", "customer360", "team", "integrations_settings"] as const;
export type Area = (typeof AREAS)[number];

interface RolesJson { roles: { key: string }[]; permissions: { area: string; by_role: Record<string, number> }[] }

export const ROLE_KEYS = ["owner", "manager", "picker", "cashier", "dispatcher", "accountant", "marketer", "courier"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/** Roldan mustaqil, faqat egasiga tegishli amallar (matritsada yo'q). */
export const OWNER_ONLY = ["tenant:manage", "features:toggle"] as const;
/** I-5: ikkinchi omil majburiy rollar (platforma admini alohida tekshiriladi). */
export const MFA_ROLES: ReadonlySet<string> = new Set(["owner", "accountant"]);

function build(): Map<string, Set<string>> {
  const json = JSON.parse(readFileSync(join(SEED_DIR, "roles_permissions.json"), "utf8")) as RolesJson;
  if (json.permissions.length !== AREAS.length) throw new Error("roles_permissions.json: 12 soha kutilgan");
  const map = new Map<string, Set<string>>();
  for (const r of json.roles) map.set(r.key, new Set());
  json.permissions.forEach((p, i) => {
    const area = AREAS[i]!;
    for (const [role, level] of Object.entries(p.by_role)) {
      const set = map.get(role);
      if (!set) throw new Error(`Noma'lum rol: ${role}`);
      if (level >= 1) set.add(`${area}:read`);
      if (level >= 2) set.add(`${area}:write`);
    }
  });
  for (const p of OWNER_ONLY) map.get("owner")!.add(p);
  return map;
}

const MATRIX = build();

export const permissionsOf = (role: string): ReadonlySet<string> => MATRIX.get(role) ?? new Set();
export const hasPermission = (role: string, perm: string) => permissionsOf(role).has(perm);
