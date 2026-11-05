import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json } from "express";
import type { NextFunction, Request, Response } from "express";
import { AppLogger } from "./common/logger";
import { requestIdMiddleware } from "./common/request-id.middleware";
import { rateLimitMiddleware } from "./common/rate-limit";
import { RedisService } from "./redis.service";
import { AppModule } from "./app.module";
import { CONFIG, type Config } from "./config";

export async function createApp(opts: { quiet?: boolean } = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: opts.quiet ? false : new AppLogger(), bodyParser: true });
  const cfg = app.get<Config>(CONFIG);
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  // Import: base64 fayl (8 MB -> ~11 MB). Faqat shu yo'lda kattaroq chegara; qolgan hamma joyda 100 KB.
  app.use("/v1/catalog/imports", json({ limit: "12mb" }));
  app.useBodyParser("json", { limit: "100kb" });
  app.use(requestIdMiddleware as (req: Request, res: Response, next: NextFunction) => void);
  app.use(rateLimitMiddleware(app.get(RedisService), cfg));
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.enableCors({
    origin: cfg.CORS_ORIGINS.split(",").map((s) => s.trim()),
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Tenant-Id", "Accept-Language", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id", "Idempotent-Replayed"],
    maxAge: 600,
  });
  return app;
}
