import { Injectable } from "@nestjs/common";

/** Vaqt manbai: testlarda boshqariladi. Barcha muddatlar shu orqali (UTC). */
@Injectable()
export class Clock {
  private offsetMs = 0;
  private fixed: Date | null = null;
  now(): Date {
    return this.fixed ? new Date(this.fixed.getTime()) : new Date(Date.now() + this.offsetMs);
  }
  /** Faqat testlar uchun. */
  advance(ms: number) {
    if (this.fixed) this.fixed = new Date(this.fixed.getTime() + ms);
    else this.offsetMs += ms;
  }
  freeze(d: Date | null) { this.fixed = d; }
  reset() { this.offsetMs = 0; this.fixed = null; }
}
