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

function buildPoolFromEnv(): mysql.Pool {
  const rawUri = process.env.DATABASE_URL;
  if (rawUri) {
    const parsed = new URL(rawUri);
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

    parsed.searchParams.delete("ssl-mode");
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("sslaccept");

    return mysql.createPool({
      uri: parsed.toString(),
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 30000,
      enableKeepAlive: true,
      ...(wantsSsl
        ? {
            ssl: {
              minVersion: "TLSv1.2",
              rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
            },
          }
        : {}),
    });
  }

  return mysql.createPool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "coffee_business_manager",
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 30000,
    enableKeepAlive: true,
    ...(process.env.DB_SSL === "true"
      ? {
          ssl: {
            minVersion: "TLSv1.2",
            rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
          },
        }
      : {}),
  });
}

if (hasExplicitDbConfig) {
  try {
    realPool = buildPoolFromEnv();
    realDb = drizzle(realPool as any, { schema, mode: "default" }) as unknown as MySql2Database<typeof schema>;
    realPool.query("SELECT 1").catch((err) => {
      if (process.env.NODE_ENV === "production") {
        console.error(`[DB] MySQL connection check failed (${err?.code || err?.message})`);
      } else {
        console.warn(`[AI Studio] MySQL unreachable (${err?.code || err?.message}) — switching to in-memory mock`);
        useMock = true;
      }
    });
  } catch (err: any) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[DB] Database initialization failed (${err?.message || err})`);
    } else {
      console.warn("[AI Studio] Database initialization failed — using in-memory mock");
      useMock = true;
    }
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
