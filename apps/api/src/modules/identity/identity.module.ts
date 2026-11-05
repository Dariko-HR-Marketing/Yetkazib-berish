import { Global, Module } from "@nestjs/common";
import { DevController } from "./dev.controller";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";
import { SessionService } from "./session.service";
import { MockSmsSender, SMS_SENDER } from "./sms.sender";
import { TelegramService } from "./telegram.service";
import { TokenService } from "./token.service";
import { TotpService } from "./totp.service";

@Global()
@Module({
  controllers: [IdentityController, DevController],
  providers: [IdentityService, SessionService, TokenService, TotpService, TelegramService, MockSmsSender, { provide: SMS_SENDER, useExisting: MockSmsSender }],
  exports: [IdentityService, SessionService, TokenService, SMS_SENDER, MockSmsSender],
})
export class IdentityModule {}
