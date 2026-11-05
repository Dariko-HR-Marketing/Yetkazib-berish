import { Global, Module } from "@nestjs/common";
import { AdminPlansService } from "./admin-plans.service";
import { FeaturesService } from "./features.service";
import { PlansFlagsController } from "./plans-flags.controller";

@Global()
@Module({ controllers: [PlansFlagsController], providers: [FeaturesService, AdminPlansService], exports: [FeaturesService] })
export class PlansFlagsModule {}
