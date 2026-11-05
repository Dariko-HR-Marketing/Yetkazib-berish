import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AccessGuard } from "./common/access";
import { Clock } from "./common/clock";
import { AllExceptionsFilter } from "./common/http-exception.filter";
import { IdempotencyInterceptor } from "./common/idempotency.interceptor";
import { LoggingInterceptor } from "./common/logging.interceptor";
import { CONFIG, loadConfig } from "./config";
import { DbService } from "./db/db.service";
import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    Clock, DbService, RedisService,
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [CONFIG, Clock, DbService, RedisService],
})
export class CoreModule {}
