import { Module } from "@nestjs/common";
import { LoyaltyModule } from "../loyalty/loyalty.module";
import { FulfillmentController } from "./fulfillment.controller";
import { FulfillmentService } from "./fulfillment.service";
import { DeliverySettingsService } from "./delivery-settings.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { StorefrontService } from "./storefront.service";

@Module({ imports: [LoyaltyModule], controllers: [OrdersController, FulfillmentController], providers: [StorefrontService, OrdersService, FulfillmentService, DeliverySettingsService], exports: [StorefrontService] })
export class OrdersModule {}
