import { applyDecorators, CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { CONFIG, type Config } from "../config";
import { Reflector } from "@nestjs/core";
import { ApiError } from "./errors";
import { hasPermission, MFA_ROLES } from "./rbac";
import type { AppRequest } from "./request-context";
import { DbService } from "../db/db.service";
import { TokenService } from "../modules/identity/token.service";

const K = { public: "access:public", tenant: "access:tenant", perm: "access:perm", admin: "access:admin", noIdem: "access:no-idem" } as const;

export const Public = () => SetMetadata(K.public, true);
/** Do'konga tegishli endpoint: `X-Tenant-Id` va faol a'zolik majburiy. */
export const TenantScoped = (permission?: string) =>
  applyDecorators(SetMetadata(K.tenant, true), ...(permission ? [SetMetadata(K.perm, permission)] : []));
export const PlatformAdmin = () => SetMetadata(K.admin, true);
export const NoIdempotency = () => SetMetadata(K.noIdem, true);
export const IS_NO_IDEM = K.noIdem;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Yagona kirish nazorati: autentifikatsiya -> (do'kon a'zoligi, 2FA) -> ruxsat.
 * Rol har so'rovda bazadan o'qiladi (T-6: o'zgarish darhol kuchga kiradi).
 * Begona do'kon yoki a'zo bo'lmagan foydalanuvchi uchun 404 (T-4): mavjudligi oshkor bo'lmaydi.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tokens: TokenService, private readonly db: DbService, @Inject(CONFIG) private readonly cfg: Config) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const h = ctx.getHandler();
    const c = ctx.getClass();
    const get = <T>(k: string) => this.reflector.getAllAndOverride<T>(k, [h, c]);
    if (get<boolean>(K.public)) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("Bearer ")) throw new ApiError(401, "auth.unauthorized");
    const claims = await this.tokens.verifyAccess(header.slice(7));

    const u = await this.db.tx({ userId: claims.sub }, (tx) =>
      tx.query<{ id: string; is_platform_admin: boolean; locale: string }>(
        `select u.id, u.is_platform_admin, u.locale from users u
         where u.id = $1 and exists (select 1 from refresh_tokens r where r.family_id = $2 and r.revoked_at is null)`, [claims.sub, claims.sid]));
    const user = u.rows[0];
    if (!user) throw new ApiError(401, "auth.token_invalid");
    req.auth = { userId: user.id, amr: claims.amr, sid: claims.sid };
    req.user = { id: user.id, isPlatformAdmin: user.is_platform_admin, locale: user.locale };
    // Sinov rejimida (OPEN_LOGIN) ikkinchi omil talab qilinmaydi.
    const hasTotp = claims.amr.includes("totp") || (this.cfg.OPEN_LOGIN === "on" && claims.amr.includes("open"));

    if (get<boolean>(K.admin)) {
      if (!user.is_platform_admin) throw new ApiError(403, "permission.denied");
      if (!hasTotp) throw new ApiError(403, "auth.mfa_required");
    }

    if (get<boolean>(K.tenant)) {
      const raw = req.headers["x-tenant-id"];
      const tenantId = Array.isArray(raw) ? raw[0] : raw;
      if (!tenantId || !UUID.test(tenantId)) throw new ApiError(404, "not_found");
      const m = await this.db.tx({ userId: user.id, tenantId }, (tx) =>
        tx.query<{ id: string; role: string }>("select id, role from memberships where tenant_id = $1 and user_id = $2 and status = 'active'", [tenantId, user.id]));
      const member = m.rows[0];
      if (!member) throw new ApiError(404, "not_found");
      if (MFA_ROLES.has(member.role) && !hasTotp) throw new ApiError(403, "auth.mfa_required", { enroll_url: "/v1/auth/totp/enroll" });
      const perm = get<string>(K.perm);
      if (perm && !hasPermission(member.role, perm)) throw new ApiError(403, "permission.denied", { required: perm });
      req.tenant = { tenantId, memberId: member.id, role: member.role };
    }
    return true;
  }
}
