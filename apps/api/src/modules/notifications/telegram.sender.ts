import { Inject, Injectable } from "@nestjs/common";
import { CONFIG, type Config } from "../../config";

/** Telegram Bot API (sendMessage). `fetchImpl` testda almashtiriladi. Token loglanmaydi. */
@Injectable()
export class TelegramSender {
  fetchImpl: typeof fetch = (...a) => fetch(...a);
  constructor(@Inject(CONFIG) private readonly cfg: Config) {}
  get available() { return Boolean(this.cfg.TELEGRAM_BOT_TOKEN); }
  async send(chatId: number | string, text: string): Promise<void> {
    const r = await this.fetchImpl(`https://api.telegram.org/bot${this.cfg.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`telegram ${r.status}`);
  }
}
