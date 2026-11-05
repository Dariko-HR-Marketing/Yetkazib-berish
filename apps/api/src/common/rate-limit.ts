import type { NextFunction, Response } from "express";
import type { Config } from "../config";
import type { RedisService } from "../redis.service";
import { ApiError } from "./errors";
import type { AppRequest } from "./request-context";

const WINDOW_SEC = 60;

/**
 * IP bo'yicha qat'iy oyna (fixed window) cheklovi (Texnik spetsifikatsiya §7: «so'rovlar soni cheklanadi»).
 * Ikki chelak: kirish endpointlari (/v1/auth/*, taklif qabul qilish) — qattiqroq; qolgan API — yumshoqroq.
 * SMS kod uchun telefon bo'yicha alohida cheklov identity modulida. Redis ishlamasa so'rovlar to'xtatilmaydi (fail-open) —
 * lekin bu monitoringda ogohlantirishga loyiq holat (S1: Sentry).
 */
export function rateLimitMiddleware(redis: RedisService, cfg: Config) {
  return async (req: AppRequest, res: Response, next: NextFunction) => {
    if (req.path === "/v1/health") return next();
    const bucket = req.path.startsWith("/v1/auth/") || /^\/v1\/invites\/[^/]+\/accept$/.test(req.path) ? "auth" : "api";
    const limit = bucket === "auth" ? cfg.RATE_LIMIT_AUTH_PER_MIN : cfg.RATE_LIMIT_API_PER_MIN;
    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / WINDOW_SEC);
    const key = `rl:${bucket}:${req.ip ?? "unknown"}:${window}`;
    try {
      const n = await redis.client.incr(key);
      if (n === 1) await redis.client.expire(key, WINDOW_SEC + 5);
      if (n > limit) {
        const seconds = WINDOW_SEC - (now % WINDOW_SEC);
        res.setHeader("Retry-After", String(seconds));
        const err = new ApiError(429, "rate.limited", { retry_after: seconds, bucket }, { seconds });
        res.status(429).json(err.toBody());
        return;
      }
    } catch {
      // fail-open
    }
    next();
  };
}
