
import dotenv from "dotenv";
import path from "path";
import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "./schema";
import { mockDb, mockPool } from "./mock-db";

// Load the .env file from the project root.
dotenv.config({
  path: path.resolve(__dirname, "../../../../.env"),
});

const hasExplicitDbConfig = Boolean(process.env.DATABASE_URL || process.env.DB_HOST);

let useMock = !hasExplicitDbConfig;
let realPool: mysql.Pool | null = null;
let realDb: MySql2Database<typeof schema> | null = null;

if (hasExplicitDbConfig) {
  try {
    const uri = process.env.DATABASE_URL;
    realPool = uri
      ? mysql.createPool({ uri, waitForConnections: true, connectionLimit: 10, connectTimeout: 2000 })
      : mysql.createPool({
          host: process.env.DB_HOST ?? "localhost",
          port: Number(process.env.DB_PORT ?? 3306),
          user: process.env.DB_USER ?? "root",
          password: process.env.DB_PASSWORD ?? "",
          database: process.env.DB_NAME ?? "coffee_business_manager",
          waitForConnections: true,
          connectionLimit: 10,
          connectTimeout: 2000,
        });
    realDb = drizzle(realPool as any, { schema, mode: "default" }) as unknown as MySql2Database<typeof schema>;
    realPool.query("SELECT 1").catch((err) => {
      console.warn(`[AI Studio] MySQL unreachable (${err?.code || err?.message}) — switching to in-memory mock`);
      useMock = true;
    });
  } catch {
    console.warn("[AI Studio] Database initialization failed — using in-memory mock");
    useMock = true;
  }
} else {
  console.warn("[AI Studio] No database configured — using in-memory mock (seeded admin@coffee.local / ChangeMe123!)");
}

export const pool: mysql.Pool = new Proxy(
  {},
  {
    get(_, prop) {
      const target = useMock || !realPool ? mockPool : realPool;
      const val = (target as any)[prop];
      return typeof val === "function" ? val.bind(target) : val;
    },
  },
) as unknown as mysql.Pool;

export const db: MySql2Database<typeof schema> = new Proxy(
  {},
  {
    get(_, prop) {
      const target = useMock || !realDb ? mockDb : realDb;
      const val = (target as any)[prop];
      return typeof val === "function" ? val.bind(target) : val;
    },
  },
) as unknown as MySql2Database<typeof schema>;
