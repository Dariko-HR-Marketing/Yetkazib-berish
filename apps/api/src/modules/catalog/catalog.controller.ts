import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { TenantScoped } from "../../common/access";
import { ApiError } from "../../common/errors";
import type { AppRequest } from "../../common/request-context";
import { parse, uuidSchema } from "../../common/validate";
import { z } from "zod";
import { CatalogService } from "./catalog.service";
import { categoryCreateDto, categoryUpdateDto, importDto, productCreateDto, productListDto, productUpdateDto, stockAdjustDto, stockOutDto, stockSetDto } from "./catalog.dto";
import { ImportService } from "./import.service";
import { StockService } from "./stock.service";

const id = (v: string) => { if (!uuidSchema.safeParse(v).success) throw new ApiError(404, "not_found"); return v; };
const limitDto = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
const summaryDto = z.object({ branch_id: uuidSchema.optional() });

@Controller("v1")
export class CatalogController {
  constructor(private readonly catalog: CatalogService, private readonly stock: StockService, private readonly imports: ImportService) {}

  // kategoriyalar
  @Get("categories") @TenantScoped("catalog:read")
  categories(@Req() req: AppRequest) { return this.catalog.listCategories(req.tenant!.tenantId, req.auth!.userId); }

  @Post("categories") @TenantScoped("catalog:write") @HttpCode(201)
  createCategory(@Body() b: unknown, @Req() req: AppRequest) { return this.catalog.createCategory(req.tenant!.tenantId, req.auth!.userId, parse(categoryCreateDto, b), req.ip); }

  @Patch("categories/:id") @TenantScoped("catalog:write")
  updateCategory(@Param("id") cid: string, @Body() b: unknown, @Req() req: AppRequest) { return this.catalog.updateCategory(req.tenant!.tenantId, req.auth!.userId, id(cid), parse(categoryUpdateDto, b), req.ip); }

  @Delete("categories/:id") @TenantScoped("catalog:write")
  deleteCategory(@Param("id") cid: string, @Req() req: AppRequest) { return this.catalog.deleteCategory(req.tenant!.tenantId, req.auth!.userId, id(cid), req.ip); }

  // mahsulotlar
  @Get("products") @TenantScoped("catalog:read")
  products(@Query() q: unknown, @Req() req: AppRequest) { return this.catalog.listProducts(req.tenant!.tenantId, req.auth!.userId, parse(productListDto, q)); }

  /** Yig'uvchi/kassir uchun: katalog ruxsatisiz, faqat qoldiq ko'rinishi (stock:read). */
  @Get("stock") @TenantScoped("stock:read")
  stockList(@Query() q: unknown, @Req() req: AppRequest) { return this.catalog.listProducts(req.tenant!.tenantId, req.auth!.userId, parse(productListDto, q)); }

  @Get("catalog/summary") @TenantScoped("catalog:read")
  summary(@Query() q: unknown, @Req() req: AppRequest) { return this.catalog.summary(req.tenant!.tenantId, req.auth!.userId, parse(summaryDto, q).branch_id); }

  @Post("products") @TenantScoped("catalog:write") @HttpCode(201)
  createProduct(@Body() b: unknown, @Req() req: AppRequest) { return this.catalog.createProduct(req.tenant!.tenantId, req.auth!.userId, parse(productCreateDto, b), req.ip); }

  @Get("products/:id") @TenantScoped("catalog:read")
  product(@Param("id") pid: string, @Query() q: unknown, @Req() req: AppRequest) { return this.catalog.getProduct(req.tenant!.tenantId, req.auth!.userId, id(pid), parse(summaryDto, q).branch_id); }

  @Patch("products/:id") @TenantScoped("catalog:write")
  updateProduct(@Param("id") pid: string, @Body() b: unknown, @Req() req: AppRequest) { return this.catalog.updateProduct(req.tenant!.tenantId, req.auth!.userId, id(pid), parse(productUpdateDto, b), req.ip); }

  @Delete("products/:id") @TenantScoped("catalog:write")
  archive(@Param("id") pid: string, @Req() req: AppRequest) { return this.catalog.archiveProduct(req.tenant!.tenantId, req.auth!.userId, id(pid), req.ip); }

  // qoldiq
  @Put("products/:id/stock") @TenantScoped("stock:write")
  setStock(@Param("id") pid: string, @Body() b: unknown, @Req() req: AppRequest) { return this.stock.set(req.tenant!.tenantId, req.auth!.userId, id(pid), parse(stockSetDto, b)); }

  @Post("products/:id/stock/adjust") @TenantScoped("stock:write") @HttpCode(200)
  adjustStock(@Param("id") pid: string, @Body() b: unknown, @Req() req: AppRequest) { return this.stock.adjust(req.tenant!.tenantId, req.auth!.userId, id(pid), parse(stockAdjustDto, b)); }

  @Post("products/:id/stock/out") @TenantScoped("stock:write") @HttpCode(200)
  markOut(@Param("id") pid: string, @Body() b: unknown, @Req() req: AppRequest) { return this.stock.markOut(req.tenant!.tenantId, req.auth!.userId, id(pid), parse(stockOutDto, b), req.ip); }

  @Get("products/:id/stock/movements") @TenantScoped("stock:read")
  movements(@Param("id") pid: string, @Query() q: unknown, @Req() req: AppRequest) { return this.stock.movements(req.tenant!.tenantId, req.auth!.userId, id(pid), parse(limitDto, q).limit); }

  // import
  @Post("catalog/imports") @TenantScoped("catalog:write") @HttpCode(200)
  runImport(@Body() b: unknown, @Req() req: AppRequest) { return this.imports.run(req.tenant!.tenantId, req.auth!.userId, parse(importDto, b), req.ip); }

  @Get("catalog/imports") @TenantScoped("catalog:read")
  importList(@Query() q: unknown, @Req() req: AppRequest) { return this.imports.list(req.tenant!.tenantId, req.auth!.userId, parse(limitDto, q).limit); }

  @Get("catalog/imports/:id") @TenantScoped("catalog:read")
  importGet(@Param("id") jid: string, @Req() req: AppRequest) { return this.imports.get(req.tenant!.tenantId, req.auth!.userId, id(jid)); }
}
