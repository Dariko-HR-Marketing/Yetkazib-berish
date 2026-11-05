import { describe, expect, it } from "vitest";
import { loadOpenApi } from "../src";

type Op = { operationId?: string; parameters?: { $ref?: string; name?: string }[]; responses: Record<string, { $ref?: string; content?: { "application/json": { schema: { $ref?: string } } } }>; security?: unknown[] };
const spec = loadOpenApi() as unknown as { openapi: string; paths: Record<string, Record<string, Op>>; components: { schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }> } };
const ops = Object.entries(spec.paths).flatMap(([path, o]) => Object.entries(o).filter(([m]) => ["get", "post", "patch", "put", "delete"].includes(m)).map(([method, op]) => ({ path, method, op })));

describe("OpenAPI shartnomasi", () => {
  it("3.1 versiya, operationId noyob", () => {
    expect(spec.openapi).toMatch(/^3\.1/);
    const ids = ops.map((o) => o.op.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("xato formati: {code, message_uz, message_ru, details}", () => {
    const err = spec.components.schemas.Error!;
    expect(Object.keys(err.properties!).sort()).toEqual(["code", "details", "message_ru", "message_uz"]);
    expect(err.required!.sort()).toEqual(["code", "details", "message_ru", "message_uz"]);
  });

  it("holatni o'zgartiruvchi har so'rov (auth'dan tashqari) Idempotency-Key talab qiladi", () => {
    for (const { path, method, op } of ops) {
      if (method === "get" || path.startsWith("/v1/auth/")) continue;
      const hasKey = op.parameters?.some((p) => p.$ref === "#/components/parameters/IdempotencyKey");
      expect(hasKey, `${method.toUpperCase()} ${path}`).toBe(true);
    }
  });

  it("do'konga tegishli endpointlar X-Tenant-Id talab qiladi (tenantlarni yaratish va admin'dan tashqari)", () => {
    for (const { path, method, op } of ops) {
      if (path === "/v1/tenants" || path.startsWith("/v1/auth/") || path.startsWith("/v1/admin/") || path.startsWith("/v1/me") || path.startsWith("/v1/legal/") || path.endsWith("/accept")) continue;
      const hasTenant = op.parameters?.some((p) => p.$ref === "#/components/parameters/TenantId");
      expect(hasTenant, `${method.toUpperCase()} ${path}`).toBe(true);
    }
  });

  it("barcha 4xx/5xx javoblar Error sxemasiga ishora qiladi", () => {
    for (const { path, method, op } of ops) {
      for (const [status, r] of Object.entries(op.responses)) {
        if (Number(status) < 400) continue;
        expect(r.$ref, `${method.toUpperCase()} ${path} ${status}`).toBe("#/components/responses/Error");
      }
    }
  });
});
