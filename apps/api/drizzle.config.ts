import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import type { Config } from "drizzle-kit";
export default { schema: "./src/database/schema.ts", out: "./drizzle", dialect: "mysql", dbCredentials: { url: process.env.DATABASE_URL ?? "mysql://coffee_user:coffee_password@localhost:3306/coffee_business_manager" } } satisfies Config;
