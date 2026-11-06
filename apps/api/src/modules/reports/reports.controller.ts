import { Controller, Get, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { TenantScoped } from "../../common/access";
import type { AppRequest } from "../../common/request-context";
import { parse } from "../../common/validate";
import { ReportsService } from "./reports.service";

const q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

@Controller("v1")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get("reports/sales") @TenantScoped("analytics:read")
  sales(@Query() query: unknown, @Req() req: AppRequest) { return this.reports.sales(req.tenant!.tenantId, req.auth!.userId, parse(q, query).days); }
}
