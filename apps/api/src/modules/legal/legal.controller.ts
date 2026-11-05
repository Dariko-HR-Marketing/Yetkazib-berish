import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { NoIdempotency, PlatformAdmin, Public } from "../../common/access";
import { ApiError } from "../../common/errors";
import type { AppRequest } from "../../common/request-context";
import { lang } from "../../common/lang";
import { parse, uuidSchema } from "../../common/validate";
import { legalDraftDto, LegalService, publishDto, type Audience } from "./legal.service";

const listQuery = z.object({ audience: z.enum(["customer", "shop", "courier"]).optional() });
const getQuery = z.object({ version: z.coerce.number().int().positive().optional() });

@Controller("v1")
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  /** Ommaviy: kirishdan oldin ham o'qiladi (oferta ochiq bo'lishi shart). */
  @Public() @NoIdempotency() @Get("legal/documents")
  list(@Query() q: unknown, @Req() req: AppRequest) {
    return this.legal.list(parse(listQuery, q).audience as Audience | undefined, lang(req));
  }

  @Public() @NoIdempotency() @Get("legal/documents/:key")
  get(@Param("key") key: string, @Query() q: unknown, @Req() req: AppRequest) {
    return this.legal.get(key, lang(req), parse(getQuery, q).version);
  }

  @Get("admin/legal") @PlatformAdmin()
  adminList(@Req() req: AppRequest) {
    return this.legal.adminList(req.auth!.userId);
  }

  @Post("admin/legal") @PlatformAdmin() @HttpCode(201)
  create(@Body() body: unknown, @Req() req: AppRequest) {
    return this.legal.createDraft(req.auth!.userId, parse(legalDraftDto, body), req.ip);
  }

  @Post("admin/legal/:id/publish") @PlatformAdmin() @HttpCode(200)
  publish(@Param("id") id: string, @Body() body: unknown, @Req() req: AppRequest) {
    if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
    return this.legal.publish(req.auth!.userId, id, parse(publishDto, body ?? {}).effective_from, req.ip);
  }
}
