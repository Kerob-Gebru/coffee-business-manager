import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import type { Config } from "drizzle-kit";

const rawUrl =
  process.env.DATABASE_URL ??
  "mysql://coffee_user:coffee_password@localhost:3306/coffee_business_manager";
const parsed = new URL(rawUrl);
const sslMode = (
  parsed.searchParams.get("ssl-mode") ||
  parsed.searchParams.get("sslmode") ||
  ""
).toLowerCase();
const wantsSsl =
  process.env.DB_SSL === "true" ||
  sslMode === "required" ||
  sslMode === "verify_ca" ||
  sslMode === "verify_identity" ||
  parsed.searchParams.has("ssl") ||
  /tidbcloud\.com|aivencloud\.com|psdb\.cloud|rds\.amazonaws\.com/i.test(parsed.hostname);

export default {
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: wantsSsl
    ? {
        host: parsed.hostname,
        port: Number(parsed.port || 3306),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ""),
        ssl: {
          minVersion: "TLSv1.2",
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
        },
      }
    : { url: rawUrl },
} satisfies Config;
