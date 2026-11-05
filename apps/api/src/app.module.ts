import { Module } from "@nestjs/common";
import { CoreModule } from "./core.module";
import { AuditEventsModule } from "./modules/audit-events/audit-events.module";
import { LegalModule } from "./modules/legal/legal.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { PlansFlagsModule } from "./modules/plans-flags/plans-flags.module";
import { TenancyModule } from "./modules/tenancy/tenancy.module";

@Module({ imports: [CoreModule, AuditEventsModule, IdentityModule, LegalModule, TenancyModule, PlansFlagsModule] })
export class AppModule {}
