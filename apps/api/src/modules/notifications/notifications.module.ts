import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { NotificationsService } from "./notifications.service";
import { TelegramSender } from "./telegram.sender";

@Module({ imports: [IdentityModule], providers: [NotificationsService, TelegramSender], exports: [NotificationsService, TelegramSender] })
export class NotificationsModule {}
