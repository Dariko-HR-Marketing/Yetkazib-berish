import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { TenantScoped } from "../../common/access";
import { ApiError } from "../../common/errors";
import type { AppRequest } from "../../common/request-context";
import { parse, uuidSchema } from "../../common/validate";
import { branchCreateDto, branchUpdateDto, inviteCreateDto, listQueryDto, memberUpdateDto, tenantCreateDto, tenantUpdateDto } from "./tenancy.dto";
import { TenancyService } from "./tenancy.service";

@Controller("v1")
export class TenancyController {
  constructor(private readonly svc: TenancyService) {}

  @Post("tenants") @HttpCode(201)
  create(@Body() body: unknown, @Req() req: AppRequest) {
    return this.svc.createTenant(req.auth!.userId, parse(tenantCreateDto, body), req.ip);
  }

  @Get("tenants/:id") @TenantScoped()
  get(@Param("id") id: string, @Req() req: AppRequest) {
    this.sameTenant(id, req);
    return this.svc.getTenant(req.tenant!.tenantId, req.auth!.userId);
  }

  @Patch("tenants/:id") @TenantScoped("tenant:manage")
  update(@Param("id") id: string, @Body() body: unknown, @Req() req: AppRequest) {
    this.sameTenant(id, req);
    return this.svc.updateTenant(req.tenant!.tenantId, req.auth!.userId, parse(tenantUpdateDto, body), req.ip);
  }

  @Get("branches") @TenantScoped()
  branches(@Req() req: AppRequest) {
    return this.svc.listBranches(req.tenant!.tenantId, req.auth!.userId);
  }

  @Post("branches") @TenantScoped("tenant:manage") @HttpCode(201)
  createBranch(@Body() body: unknown, @Req() req: AppRequest) {
    return this.svc.createBranch(req.tenant!.tenantId, req.auth!.userId, parse(branchCreateDto, body), req.ip);
  }

  @Patch("branches/:id") @TenantScoped("tenant:manage")
  updateBranch(@Param("id") id: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.svc.updateBranch(req.tenant!.tenantId, req.auth!.userId, parse(uuidSchema, id), parse(branchUpdateDto, body), req.ip);
  }

  @Get("invites") @TenantScoped("team:write")
  invites(@Req() req: AppRequest) {
    return this.svc.listInvites(req.tenant!.tenantId, req.auth!.userId);
  }

  @Post("invites") @TenantScoped("team:write") @HttpCode(201)
  invite(@Body() body: unknown, @Req() req: AppRequest) {
    return this.svc.createInvite(req.tenant!.tenantId, req.auth!.userId, parse(inviteCreateDto, body), req.ip);
  }

  @Post("invites/:token/accept") @HttpCode(200)
  accept(@Param("token") token: string, @Req() req: AppRequest) {
    return this.svc.acceptInvite(req.auth!.userId, token, req.ip);
  }

  @Get("members") @TenantScoped("team:read")
  members(@Query() q: unknown, @Req() req: AppRequest) {
    const p = parse(listQueryDto, q);
    return this.svc.listMembers(req.tenant!.tenantId, req.auth!.userId, p.limit, p.cursor);
  }

  @Patch("members/:id") @TenantScoped("team:write")
  updateMember(@Param("id") id: string, @Body() body: unknown, @Req() req: AppRequest) {
    if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
    return this.svc.updateMember(req.tenant!.tenantId, req.auth!.userId, id, parse(memberUpdateDto, body), req.ip);
  }

  /** URL'dagi do'kon X-Tenant-Id bilan bir xil bo'lishi shart; aks holda 404 (mavjudligi oshkor bo'lmaydi). */
  private sameTenant(id: string, req: AppRequest) {
    if (id !== req.tenant!.tenantId) throw new ApiError(404, "not_found");
  }
}
