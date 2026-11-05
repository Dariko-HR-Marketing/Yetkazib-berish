import { AsyncLocalStorage } from "node:async_hooks";
import type { Request } from "express";

interface Store { requestId: string }
export const als = new AsyncLocalStorage<Store>();
export const requestIdOf = () => als.getStore()?.requestId ?? null;

export interface AuthInfo {
  userId: string;
  amr: string[];
  sid: string;
}
export interface TenantInfo {
  tenantId: string;
  memberId: string;
  role: string;
}
export type AppRequest = Request & { auth?: AuthInfo; tenant?: TenantInfo; user?: { id: string; isPlatformAdmin: boolean; locale: string }; requestId?: string };
