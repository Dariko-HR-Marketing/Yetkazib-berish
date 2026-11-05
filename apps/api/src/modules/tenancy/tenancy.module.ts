import { Global, Module } from "@nestjs/common";
import { TenancyController } from "./tenancy.controller";
import { TenancyService } from "./tenancy.service";

@Global()
@Module({ controllers: [TenancyController], providers: [TenancyService], exports: [TenancyService] })
export class TenancyModule {}
