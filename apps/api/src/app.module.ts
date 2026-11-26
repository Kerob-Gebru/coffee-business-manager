import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { HealthController } from "./health.controller";
import { AuthController } from "./auth/auth.controller";
import { CompanyController } from "./company/company.controller";
import { ContactsController } from "./contacts/contacts.controller";
import { TransactionsController } from "./finance/transactions.controller";
import { CoffeeTradesController } from "./modules/coffee-trades.controller";
import { ProcessingController } from "./modules/processing.controller";
import { InventoryController } from "./modules/inventory.controller";
import { VehiclesController } from "./modules/vehicles.controller";
import { EmployeesController } from "./modules/employees.controller";
import { InvoicesController } from "./invoices/invoices.controller";
import { ReportsController } from "./reports/reports.controller";
import { ExchangeRatesController } from "./currency/exchange-rates.controller";
import { ExchangeRateService } from "./currency/exchange-rate.service";
import { MarketController } from "./market/market.controller";
import { MarketService } from "./market/market.service";
import { AuthGuard } from "./common/auth.guard";

@Module({
  controllers: [
    HealthController,
    AuthController,
    CompanyController,
    ContactsController,
    TransactionsController,
    CoffeeTradesController,
    ProcessingController,
    InventoryController,
    VehiclesController,
    EmployeesController,
    InvoicesController,
    ReportsController,
    ExchangeRatesController,
    MarketController,
  ],
  providers: [ExchangeRateService, MarketService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
