import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from "@nestjs/common";
import { TenantScoped } from "../../common/access";
import { ApiError } from "../../common/errors";
import type { AppRequest } from "../../common/request-context";
import { parse, uuidSchema } from "../../common/validate";
import { assignDto, failDto, locationDto, pickItemDto } from "./fulfillment.dto";
import { FulfillmentService } from "./fulfillment.service";

const id = (v: string) => { if (!uuidSchema.safeParse(v).success) throw new ApiError(404, "not_found"); return v; };

@Controller("v1")
export class FulfillmentController {
  constructor(private readonly f: FulfillmentService) {}

  // yig'ish (picking:*)
  @Get("picking") @TenantScoped("picking:read")
  queue(@Req() req: AppRequest) { return this.f.pickingQueue(req.tenant!.tenantId, req.auth!.userId); }

  @Post("orders/:id/pick/start") @TenantScoped("picking:write") @HttpCode(200)
  start(@Param("id") oid: string, @Req() req: AppRequest) { return this.f.startPicking(req.tenant!.tenantId, req.auth!.userId, id(oid)); }

  @Put("orders/:id/items/:itemId/pick") @TenantScoped("picking:write")
  pick(@Param("id") oid: string, @Param("itemId") iid: string, @Body() b: unknown, @Req() req: AppRequest) { return this.f.pickItem(req.tenant!.tenantId, req.auth!.userId, id(oid), id(iid), parse(pickItemDto, b)); }

  @Post("orders/:id/pick/finish") @TenantScoped("picking:write") @HttpCode(200)
  finish(@Param("id") oid: string, @Req() req: AppRequest) { return this.f.finishPicking(req.tenant!.tenantId, req.auth!.userId, id(oid)); }

  // dispetcher (dispatch:*)
  @Get("dispatch/couriers") @TenantScoped("dispatch:read")
  couriers(@Req() req: AppRequest) { return this.f.couriers(req.tenant!.tenantId, req.auth!.userId); }

  @Post("orders/:id/assign") @TenantScoped("dispatch:write") @HttpCode(200)
  assign(@Param("id") oid: string, @Body() b: unknown, @Req() req: AppRequest) { return this.f.assign(req.tenant!.tenantId, req.auth!.userId, id(oid), parse(assignDto, b).courier_user_id, req.ip); }

  // kuryer (faqat o'z topshiriqlari)
  @Get("courier/deliveries") @TenantScoped("courier:self")
  mine(@Req() req: AppRequest) { return this.f.myDeliveries(req.tenant!.tenantId, req.auth!.userId); }

  @Post("courier/deliveries/:id/pickup") @TenantScoped("courier:self") @HttpCode(200)
  pickup(@Param("id") did: string, @Req() req: AppRequest) { return this.f.pickup(req.tenant!.tenantId, req.auth!.userId, id(did)); }

  @Post("courier/deliveries/:id/deliver") @TenantScoped("courier:self") @HttpCode(200)
  deliver(@Param("id") did: string, @Req() req: AppRequest) { return this.f.deliver(req.tenant!.tenantId, req.auth!.userId, id(did)); }

  @Post("courier/deliveries/:id/fail") @TenantScoped("courier:self") @HttpCode(200)
  fail(@Param("id") did: string, @Body() b: unknown, @Req() req: AppRequest) { return this.f.fail(req.tenant!.tenantId, req.auth!.userId, id(did), parse(failDto, b).reason); }

  @Post("courier/location") @TenantScoped("courier:self") @HttpCode(200)
  location(@Body() b: unknown, @Req() req: AppRequest) { return this.f.location(req.tenant!.tenantId, req.auth!.userId, parse(locationDto, b)); }
}
