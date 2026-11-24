
import dotenv from "dotenv";
import path from "path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";

// Load the .env file from the project root.
dotenv.config({
  path: path.resolve(__dirname, "../../../../.env"),
});

// Read database configuration from .env.
const host = process.env.DB_HOST ?? "localhost";
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER ?? "root";
const password = process.env.DB_PASSWORD ?? "";
const database = process.env.DB_NAME ?? "coffee_business_manager";

// Create MySQL connection pool.
export const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit: 10,
});

// Connect Drizzle ORM to MySQL.
export const db = drizzle(pool, {
  schema,
  mode: "default",
});
