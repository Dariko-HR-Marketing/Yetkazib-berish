import { Injectable, Logger } from "@nestjs/common";
import { maskPhones } from "../../common/logger";

export const SMS_SENDER = Symbol("SMS_SENDER");
export interface SmsSender {
  send(phone: string, text: string): Promise<void>;
}

/** Soxta provayder (O10: Eskiz/Play Mobile tanlangach, shu interfeys bilan almashtiriladi). */
@Injectable()
export class MockSmsSender implements SmsSender {
  private readonly log = new Logger("MockSms");
  readonly outbox: { phone: string; text: string }[] = [];
  async send(phone: string, text: string) {
    this.outbox.push({ phone, text });
    if (this.outbox.length > 500) this.outbox.shift();
    // Faqat dev: kod konsolda ko'rinadi, telefon maskalangan. Productionda mock ishlatilmaydi.
    this.log.debug(maskPhones(`SMS -> ${phone}: ${text}`));
  }
}
