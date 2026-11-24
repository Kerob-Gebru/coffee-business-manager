import { Controller, Get } from "@nestjs/common";
import { pool } from "./database/client";
import { Public } from "./common/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  async health() {
    let database: "connected" | "unavailable" = "connected";
    try {
      await pool.query("SELECT 1");
    } catch {
      database = "unavailable";
    }
    return {
      ok: database === "connected",
      service: "coffee-business-manager-api",
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
