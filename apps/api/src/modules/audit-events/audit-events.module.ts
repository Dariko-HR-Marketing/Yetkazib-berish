import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { EventsDispatcher } from "./events.dispatcher";
import { EventsService } from "./events.service";

@Global()
@Module({ providers: [AuditService, EventsService, EventsDispatcher], exports: [AuditService, EventsService, EventsDispatcher] })
export class AuditEventsModule {}
