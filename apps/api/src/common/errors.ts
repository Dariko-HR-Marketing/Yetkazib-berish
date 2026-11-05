import { t } from "@dostavka/i18n";
import type { ApiErrorBody } from "@dostavka/contracts";

/** Barcha domen xatolari shu orqali: `{code, message_uz, message_ru, details}` formatiga aylanadi. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details: Record<string, unknown> = {},
    public readonly params: Record<string, string | number> = {},
  ) {
    super(code);
  }

  toBody(): ApiErrorBody {
    return {
      code: this.code,
      message_uz: t("uz", this.code, this.params),
      message_ru: t("ru", this.code, this.params),
      details: this.details,
    };
  }
}

export const notFound = (code = "not_found") => new ApiError(404, code);
