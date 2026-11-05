import { Inject, Injectable } from "@nestjs/common";
import { jwtVerify, SignJWT } from "jose";
import { ApiError } from "../../common/errors";
import { CONFIG, type Config } from "../../config";
import { Clock } from "../../common/clock";

export const ACCESS_TTL_SEC = 15 * 60;
export const MFA_TTL_SEC = 5 * 60;

export interface AccessClaims { sub: string; amr: string[]; sid: string }

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;
  constructor(@Inject(CONFIG) cfg: Config, private readonly clock: Clock) {
    this.key = new TextEncoder().encode(cfg.JWT_SECRET);
  }

  async signAccess(c: AccessClaims): Promise<string> {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({ amr: c.amr, sid: c.sid, typ: "access" }).setProtectedHeader({ alg: "HS256" }).setSubject(c.sub).setIssuedAt(now).setExpirationTime(now + ACCESS_TTL_SEC).sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const p = await this.verify(token, "access");
    return { sub: String(p.sub), amr: (p.amr as string[]) ?? [], sid: String(p.sid) };
  }

  async signMfa(userId: string): Promise<string> {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({ typ: "mfa" }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt(now).setExpirationTime(now + MFA_TTL_SEC).sign(this.key);
  }

  async verifyMfa(token: string): Promise<string> {
    return String((await this.verify(token, "mfa", "auth.mfa_invalid")).sub);
  }

  private async verify(token: string, typ: string, code = "auth.token_invalid") {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"], currentDate: this.clock.now() });
      if (payload.typ !== typ) throw new Error("typ");
      return payload;
    } catch {
      throw new ApiError(401, code);
    }
  }
}
