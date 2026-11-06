import { Module } from "@nestjs/common";
import { LoyaltyModule } from "../loyalty/loyalty.module";
import { PaymentsModule } from "../payments/payments.module";
import { FulfillmentController } from "./fulfillment.controller";
import { FulfillmentService } from "./fulfillment.service";
import { CashService } from "./cash.service";
import { DeliverySettingsService } from "./delivery-settings.service";
import { PaymentFlowService } from "./payment-flow.service";
import { PaymentsController } from "./payments.controller";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { StorefrontService } from "./storefront.service";

@Module({ imports: [LoyaltyModule, PaymentsModule], controllers: [OrdersController, FulfillmentController, PaymentsController], providers: [StorefrontService, OrdersService, FulfillmentService, DeliverySettingsService, PaymentFlowService, CashService], exports: [StorefrontService] })
export class OrdersModule {}
