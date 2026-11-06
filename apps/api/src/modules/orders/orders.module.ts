import { Module } from "@nestjs/common";
import { FulfillmentController } from "./fulfillment.controller";
import { FulfillmentService } from "./fulfillment.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { StorefrontService } from "./storefront.service";

@Module({ controllers: [OrdersController, FulfillmentController], providers: [StorefrontService, OrdersService, FulfillmentService], exports: [StorefrontService] })
export class OrdersModule {}
