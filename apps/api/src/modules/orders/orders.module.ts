import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { StorefrontService } from "./storefront.service";

@Module({ controllers: [OrdersController], providers: [StorefrontService, OrdersService], exports: [StorefrontService] })
export class OrdersModule {}
