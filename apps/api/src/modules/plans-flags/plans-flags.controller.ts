import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import { PlatformAdmin, TenantScoped } from "../../common/access";
import { ApiError } from "../../common/errors";
import type { AppRequest } from "../../common/request-context";
import { parse, uuidSchema } from "../../common/validate";
import { z } from "zod";
import { AdminPlansService, planDraftDto } from "./admin-plans.service";
import { FeaturesService } from "./features.service";

const toggleDto = z.object({ enabled: z.boolean() }).strict();
const flagDto = z.object({ platform_enabled: z.boolean() }).strict();
const planCodeDto = z.object({ plan_code: z.enum(["start", "biznes", "pro", "tarmoq"]) }).strict();

@Controller("v1")
export class PlansFlagsController {
  constructor(private readonly features: FeaturesService, private readonly admin: AdminPlansService) {}

  @Get("features") @TenantScoped()
  list(@Req() req: AppRequest) {
    return this.features.resolved(req.tenant!.tenantId);
  }

  @Patch("features/:key") @TenantScoped("features:toggle")
  toggle(@Param("key") key: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.features.toggle(req.tenant!.tenantId, req.auth!.userId, key, parse(toggleDto, body).enabled, req.ip);
  }

  // ---- admin ----
  @Get("admin/plans") @PlatformAdmin()
  plans(@Req() req: AppRequest) {
    return this.admin.list(req.auth!.userId).then((items) => ({ items }));
  }

  @Post("admin/plans") @PlatformAdmin() @HttpCode(201)
  createPlan(@Body() body: unknown, @Req() req: AppRequest) {
    return this.admin.createDraft(req.auth!.userId, parse(planDraftDto, body), req.ip);
  }

  @Post("admin/plans/:id/publish") @PlatformAdmin() @HttpCode(200)
  publish(@Param("id") id: string, @Req() req: AppRequest) {
    if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
    return this.admin.publish(req.auth!.userId, id, req.ip);
  }

  @Get("admin/flags") @PlatformAdmin()
  flags(@Req() req: AppRequest) {
    return this.features.listPlatformFlags(req.auth!.userId).then((items) => ({ items }));
  }

  @Patch("admin/flags/:key") @PlatformAdmin()
  setFlag(@Param("key") key: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.features.setPlatformFlag(req.auth!.userId, key, parse(flagDto, body).platform_enabled, req.ip);
  }

  @Post("admin/tenants/:id/plan") @PlatformAdmin() @HttpCode(200)
  setPlan(@Param("id") id: string, @Body() body: unknown, @Req() req: AppRequest) {
    if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
    return this.admin.setTenantPlan(req.auth!.userId, id, parse(planCodeDto, body).plan_code, req.ip);
  }
}
