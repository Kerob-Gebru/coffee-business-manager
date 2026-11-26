import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import type { SessionUser } from "../common/session-user";
import { MarketService } from "./market.service";

@Controller("market")
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get("commodities")
  async commodities(@CurrentUser() user: SessionUser, @Query("refresh") refresh = "") {
    assertCan(user, "modules.view");
    return this.marketService.getCommodities(user, refresh === "1" || refresh === "true");
  }
}
