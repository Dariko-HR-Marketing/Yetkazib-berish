export type { paths, components } from "./schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/** OpenAPI hujjati (testlar va ish vaqtida shartnoma tekshiruvi uchun). */
export function loadOpenApi(): { components: { schemas: Record<string, unknown> }; paths: Record<string, unknown> } {
  return parse(readFileSync(join(__dirname, "..", "openapi", "openapi.yaml"), "utf8"));
}

export type ApiErrorBody = {
  code: string;
  message_uz: string;
  message_ru: string;
  details: Record<string, unknown>;
};
