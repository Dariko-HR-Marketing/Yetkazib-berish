import type { LoggerService } from "@nestjs/common";

const PHONE = /\+?998[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g;
const SENSITIVE_KEY = /(phone|telefon|address|manzil|full_?name|first_?name|last_?name|ism|email|token|secret|password|code|authorization|init_?data|otp|pin|card)/i;

/** Telefonni maskalaydi: +998901234567 -> +99890***4567 (loglarda shaxsiy ma'lumot bo'lmaydi). */
export function maskPhones(s: string): string {
  return s.replace(PHONE, (m) => {
    const d = m.replace(/\D/g, "");
    return `+${d.slice(0, 5)}***${d.slice(-4)}`;
  });
}

export function redact(value: unknown, depth = 0): unknown {
  if (value == null || depth > 5) return value;
  if (typeof value === "string") return maskPhones(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export class AppLogger implements LoggerService {
  constructor(private readonly sink: (line: string) => void = (l) => process.stdout.write(l + "\n")) {}

  private write(level: string, message: unknown, ctx?: string, meta?: unknown) {
    const text = typeof message === "string" ? message : JSON.stringify(redact(message));
    this.sink(JSON.stringify({ ts: new Date().toISOString(), level, ctx, msg: maskPhones(text), ...(meta ? { meta: redact(meta) as object } : {}) }));
  }
  log(message: unknown, ctx?: string) { this.write("info", message, ctx); }
  error(message: unknown, trace?: string, ctx?: string) { this.write("error", message, ctx, trace ? { trace: maskPhones(trace) } : undefined); }
  warn(message: unknown, ctx?: string) { this.write("warn", message, ctx); }
  debug(message: unknown, ctx?: string) { this.write("debug", message, ctx); }
  verbose(message: unknown, ctx?: string) { this.write("verbose", message, ctx); }
}
