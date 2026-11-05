import { Body, Controller, HttpCode, Get, Post, Req } from "@nestjs/common";
import { NoIdempotency, Public } from "../../common/access";
import type { AppRequest } from "../../common/request-context";
import { parse } from "../../common/validate";
import { IdentityService } from "./identity.service";
import { SessionService } from "./session.service";
import { otpRequestDto, otpVerifyDto, refreshDto, telegramDto, totpCodeDto, totpVerifyDto } from "./identity.dto";

@Controller("v1")
export class IdentityController {
  constructor(private readonly identity: IdentityService, private readonly sessions: SessionService) {}

  @Public() @NoIdempotency() @Post("auth/otp/request") @HttpCode(202)
  requestOtp(@Body() body: unknown) {
    return this.identity.requestOtp(parse(otpRequestDto, body).phone);
  }

  @Public() @NoIdempotency() @Post("auth/otp/verify") @HttpCode(200)
  verifyOtp(@Body() body: unknown, @Req() req: AppRequest) {
    const d = parse(otpVerifyDto, body);
    return this.identity.verifyOtp(d.phone, d.code, { consents: d.consents, marketing_consent: d.marketing_consent, ip: req.ip });
  }

  @Public() @NoIdempotency() @Post("auth/telegram") @HttpCode(200)
  telegram(@Body() body: unknown, @Req() req: AppRequest) {
    const d = parse(telegramDto, body);
    return this.identity.signInTelegram(d.init_data, { consents: d.consents, marketing_consent: d.marketing_consent, ip: req.ip });
  }

  @Public() @NoIdempotency() @Post("auth/refresh") @HttpCode(200)
  refresh(@Body() body: unknown) {
    return this.sessions.refresh(parse(refreshDto, body).refresh_token);
  }

  @NoIdempotency() @Post("auth/logout") @HttpCode(204)
  async logout(@Req() req: AppRequest) {
    await this.sessions.revokeFamily(req.auth!.sid);
  }

  @NoIdempotency() @Post("auth/totp/enroll") @HttpCode(200)
  enroll(@Req() req: AppRequest) {
    return this.identity.enrollTotp(req.auth!.userId);
  }

  @NoIdempotency() @Post("auth/totp/confirm") @HttpCode(200)
  confirm(@Body() body: unknown, @Req() req: AppRequest) {
    return this.identity.confirmTotp(req.auth!.userId, req.auth!.sid, parse(totpCodeDto, body).code);
  }

  @Public() @NoIdempotency() @Post("auth/totp/verify") @HttpCode(200)
  verifyTotp(@Body() body: unknown) {
    const d = parse(totpVerifyDto, body);
    return this.identity.verifyTotp(d.mfa_token, d.code);
  }

  @Get("me")
  me(@Req() req: AppRequest) {
    return this.identity.me(req.auth!.userId);
  }
}
