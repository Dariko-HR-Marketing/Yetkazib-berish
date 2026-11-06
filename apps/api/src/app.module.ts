import { Module } from "@nestjs/common";
import { CoreModule } from "./core.module";
import { AuditEventsModule } from "./modules/audit-events/audit-events.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { LoyaltyModule } from "./modules/loyalty/loyalty.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { AdminModule } from "./modules/admin/admin.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { LegalModule } from "./modules/legal/legal.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { PlansFlagsModule } from "./modules/plans-flags/plans-flags.module";
import { TenancyModule } from "./modules/tenancy/tenancy.module";

@Module({ imports: [CoreModule, AuditEventsModule, IdentityModule, LegalModule, TenancyModule, PlansFlagsModule, CatalogModule, LoyaltyModule, OrdersModule, ReportsModule, AdminModule, NotificationsModule] })
export class AppModule {}
