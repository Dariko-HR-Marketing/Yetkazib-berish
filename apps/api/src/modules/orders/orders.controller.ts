import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { Public, TenantScoped } from "../../common/access";
import { ApiError } from "../../common/errors";
import type { AppRequest } from "../../common/request-context";
import { parse, uuidSchema } from "../../common/validate";
import { z } from "zod";
import { addressCreateDto, addressUpdateDto, cancelDto, deliverySettingsDto, orderCreateDto, orderListDto, orderStatusDto, shopProductsDto } from "./orders.dto";
import { AddressesService } from "./addresses.service";
import { DeliverySettingsService } from "./delivery-settings.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { OrdersService } from "./orders.service";
import { StorefrontService } from "./storefront.service";

const id = (v: string) => { if (!uuidSchema.safeParse(v).success) throw new ApiError(404, "not_found"); return v; };
const limitDto = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

@Controller("v1")
export class OrdersController {
  constructor(private readonly shops: StorefrontService, private readonly orders: OrdersService, private readonly delivery: DeliverySettingsService, private readonly loyalty: LoyaltyService, private readonly addresses: AddressesService) {}

  // ommaviy vitrina
  @Public() @Get("marketplace/shops")
  marketplace() { return this.shops.marketplace(); }

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

  @Get("shops/:slug/loyalty")
  async myLoyalty(@Param("slug") slug: string, @Req() req: AppRequest) { const s = await this.shops.resolve(slug); return this.loyalty.summary(s.id, req.auth!.userId); }

  // saqlangan manzillar (xaridor, shu do'kon doirasida)
  @Get("shops/:slug/addresses")
  myAddresses(@Param("slug") slug: string, @Req() req: AppRequest) { return this.addresses.list(slug, req.auth!.userId); }

  @Post("shops/:slug/addresses") @HttpCode(201)
  addAddress(@Param("slug") slug: string, @Body() b: unknown, @Req() req: AppRequest) { return this.addresses.create(slug, req.auth!.userId, parse(addressCreateDto, b)); }

  @Patch("shops/:slug/addresses/:id")
  editAddress(@Param("slug") slug: string, @Param("id") aid: string, @Body() b: unknown, @Req() req: AppRequest) { return this.addresses.update(slug, req.auth!.userId, id(aid), parse(addressUpdateDto, b)); }

  @Delete("shops/:slug/addresses/:id")
  deleteAddress(@Param("slug") slug: string, @Param("id") aid: string, @Req() req: AppRequest) { return this.addresses.remove(slug, req.auth!.userId, id(aid)); }

  // yetkazish sozlamalari
  @Get("delivery/settings") @TenantScoped("orders:read")
  getDelivery(@Req() req: AppRequest) { return this.delivery.get(req.tenant!.tenantId, req.auth!.userId); }

  @Put("delivery/settings") @TenantScoped("tenant:manage")
  setDelivery(@Body() b: unknown, @Req() req: AppRequest) { return this.delivery.set(req.tenant!.tenantId, req.auth!.userId, parse(deliverySettingsDto, b), req.ip); }

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
