import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { Public, TenantScoped } from "../../common/access";
import { ApiError } from "../../common/errors";
import type { AppRequest } from "../../common/request-context";
import { parse, uuidSchema } from "../../common/validate";
import { z } from "zod";
import { cancelDto, orderCreateDto, orderListDto, orderStatusDto, shopProductsDto } from "./orders.dto";
import { OrdersService } from "./orders.service";
import { StorefrontService } from "./storefront.service";

const id = (v: string) => { if (!uuidSchema.safeParse(v).success) throw new ApiError(404, "not_found"); return v; };
const limitDto = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

@Controller("v1")
export class OrdersController {
  constructor(private readonly shops: StorefrontService, private readonly orders: OrdersService) {}

  // ommaviy vitrina
  @Public() @Get("shops/:slug")
  shop(@Param("slug") slug: string) { return this.shops.shop(slug); }

  @Public() @Get("shops/:slug/categories")
  categories(@Param("slug") slug: string) { return this.shops.categories(slug); }

  @Public() @Get("shops/:slug/products")
  products(@Param("slug") slug: string, @Query() q: unknown) { return this.shops.products(slug, parse(shopProductsDto, q)); }

  // xaridor (kirgan foydalanuvchi, do'kon a'zosi bo'lishi shart emas)
  @Post("shops/:slug/orders") @HttpCode(201)
  place(@Param("slug") slug: string, @Body() b: unknown, @Req() req: AppRequest) { return this.orders.place(slug, req.auth!.userId, parse(orderCreateDto, b)); }

  @Get("shops/:slug/orders")
  mine(@Param("slug") slug: string, @Query() q: unknown, @Req() req: AppRequest) { return this.orders.customerList(slug, req.auth!.userId, parse(limitDto, q).limit); }

  @Get("shops/:slug/orders/:id")
  mineOne(@Param("slug") slug: string, @Param("id") oid: string, @Req() req: AppRequest) { return this.orders.customerGet(slug, req.auth!.userId, id(oid)); }

  @Post("shops/:slug/orders/:id/cancel") @HttpCode(200)
  cancel(@Param("slug") slug: string, @Param("id") oid: string, @Body() b: unknown, @Req() req: AppRequest) { return this.orders.customerCancel(slug, req.auth!.userId, id(oid), parse(cancelDto, b ?? {}).reason); }

  // panel
  @Get("orders") @TenantScoped("orders:read")
  list(@Query() q: unknown, @Req() req: AppRequest) { return this.orders.panelList(req.tenant!.tenantId, req.auth!.userId, parse(orderListDto, q)); }

  @Get("orders/:id") @TenantScoped("orders:read")
  one(@Param("id") oid: string, @Req() req: AppRequest) { return this.orders.panelGet(req.tenant!.tenantId, req.auth!.userId, id(oid)); }

  @Post("orders/:id/status") @TenantScoped("orders:write") @HttpCode(200)
  setStatus(@Param("id") oid: string, @Body() b: unknown, @Req() req: AppRequest) {
    const d = parse(orderStatusDto, b);
    return this.orders.panelSetStatus(req.tenant!.tenantId, req.auth!.userId, id(oid), d.status, d.reason, req.ip);
  }
}
