import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { ImportService } from "./import.service";
import { StockService } from "./stock.service";

@Module({ controllers: [CatalogController], providers: [CatalogService, StockService, ImportService], exports: [CatalogService, StockService] })
export class CatalogModule {}
