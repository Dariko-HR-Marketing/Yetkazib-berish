import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import { als, type AppRequest } from "./request-context";

export function requestIdMiddleware(req: AppRequest, res: Response, next: NextFunction) {
  const incoming = req.headers["x-request-id"];
  const requestId = typeof incoming === "string" && /^[\w.-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  als.run({ requestId }, next);
}
