import { Body, Controller, Delete, Get, Put, Query } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import type { SessionUser } from "../common/session-user";
import { ExchangeRateService } from "./exchange-rate.service";

@Controller("exchange-rates")
export class ExchangeRatesController {
  constructor(private readonly exchangeRates: ExchangeRateService) {}

  @Get()
  latest(@CurrentUser() user: SessionUser, @Query("refresh") refresh = "") {
    return this.exchangeRates.latest(user, refresh === "1" || refresh === "true");
  }

  @Get("history")
  history(
    @CurrentUser() user: SessionUser,
    @Query("days") days = "30",
    @Query("refresh") refresh = "",
  ) {
    return this.exchangeRates.history(user, days, refresh === "1" || refresh === "true");
  }

  @Get("override")
  getOverride(@CurrentUser() user: SessionUser) {
    return this.exchangeRates.getOverride(user);
  }

  @Put("override")
  setOverride(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    return this.exchangeRates.setOverride(user, body);
  }

  @Delete("override")
  clearOverride(@CurrentUser() user: SessionUser) {
    return this.exchangeRates.clearOverride(user);
  }
}
