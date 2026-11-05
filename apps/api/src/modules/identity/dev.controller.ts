import { Controller, Get, Inject, Query } from "@nestjs/common";
import { Public } from "../../common/access";
import { ApiError } from "../../common/errors";
import { CONFIG, type Config } from "../../config";
import { MockSmsSender } from "./sms.sender";

/** Faqat e2e/dev: `DEV_SMS_INBOX=on` bo'lmasa 404. Shartnomaga kirmaydi; productionda config yoqishga yo'l qo'ymaydi. */
@Controller("v1/_dev")
export class DevController {
  constructor(private readonly sms: MockSmsSender, @Inject(CONFIG) private readonly cfg: Config) {}

  @Public() @Get("sms")
  latest(@Query("phone") phone?: string) {
    if (this.cfg.DEV_SMS_INBOX !== "on" || this.cfg.NODE_ENV === "production") throw new ApiError(404, "not_found");
    const items = this.sms.outbox.filter((m) => !phone || m.phone === phone).slice(-10);
    return { items };
  }
}
