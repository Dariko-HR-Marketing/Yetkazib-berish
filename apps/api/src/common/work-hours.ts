import { z } from "zod";

/** Filial ish vaqti. `{}` — jadval berilmagan (doim ochiq). Aks holda 7 kunning hammasi: {open, close} yoki null (dam). Vaqt Asia/Tashkent (UTC+5, yozgi vaqtsiz). */
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Day = (typeof DAYS)[number];
const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (s: string) => (s === "24:00" ? 1440 : Number(s.slice(0, 2)) * 60 + Number(s.slice(3)));
const slot = z.object({ open: z.string().regex(hhmm), close: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/) }).strict()
  .refine((s) => minutes(s.close) > minutes(s.open), { message: "yopilish vaqti ochilishdan keyin bo'lishi kerak", path: ["close"] });

export const workHoursSchema = z.union([
  z.object({}).strict(),
  z.object(Object.fromEntries(DAYS.map((d) => [d, slot.nullable()])) as Record<Day, z.ZodNullable<typeof slot>>).strict(),
]);
export type WorkHours = z.infer<typeof workHoursSchema>;

const TASHKENT_OFFSET_MS = 5 * 3600_000;

/** Berilgan lahzada filial ochiqmi (jadval yo'q — ochiq). */
export function isOpenAt(wh: unknown, now: Date): boolean {
  const parsed = workHoursSchema.safeParse(wh);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return true; // buzilgan/bo'sh jadval buyurtmani to'smaydi
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const day = DAYS[(local.getUTCDay() + 6) % 7]!; // 0=yakshanba -> mon=0
  const s = (parsed.data as Record<Day, { open: string; close: string } | null>)[day];
  if (!s) return false;
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  return m >= minutes(s.open) && m < minutes(s.close);
}
