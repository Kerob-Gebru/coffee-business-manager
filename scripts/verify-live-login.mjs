import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

// Verifies the live login path without changing credentials. If
// LIVE_CHECK_PASSWORD is provided (never printed), a real positive login is
// performed; otherwise a wrong password must yield the normal 401 response,
// proving the post-migration user/company lookup and bcrypt comparison run.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
dotenv.config({ path: path.join(root, ".env") });

const DB = process.env.LIVE_CHECK_DB ?? "coffee_business_manager";
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}/api`;
if (DB !== "coffee_business_manager") throw new Error(`Refusing unexpected database: ${DB}`);

const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: DB,
});
const [[admin]] = await connection.query(
  "SELECT u.email, u.company_id AS companyId, c.name AS company FROM users u JOIN companies c ON c.id = u.company_id ORDER BY u.id LIMIT 1",
);
await connection.end();
if (!admin) throw new Error("No administrator found on the live database");

const child = spawn(process.execPath, ["dist/main.js"], {
  cwd: path.join(root, "apps/api"),
  env: {
    ...process.env,
    DB_NAME: DB,
    API_PORT: String(PORT),
    NODE_ENV: "production",
    SESSION_SECRET: `live-check-${Date.now()}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => (log += d.toString()));
child.stderr.on("data", (d) => (log += d.toString()));

let cookie = "";
async function call(method, url, body) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";")[0];
    if (pair.startsWith("coffee.sid=")) cookie = pair;
  }
  const text = await res.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body: parsed };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const deadline = Date.now() + 30000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`API exited early:\n${log}`);
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) break;
    } catch {}
    if (Date.now() > deadline) throw new Error(`API did not start:\n${log}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log("PASS live API health (database connected)");

  const password = process.env.LIVE_CHECK_PASSWORD;
  if (password) {
    const login = await call("POST", "/auth/login", { email: admin.email, password });
    expect(login.status === 201, `positive login failed: ${login.status} ${JSON.stringify(login.body)}`);
    const me = await call("GET", "/auth/me");
    expect(me.status === 200 && me.body.company?.name === admin.company, "session did not resolve to Legacy Workspace");
    console.log(`PASS live administrator login: ${admin.email} -> ${admin.company} (role=${login.body.user.role})`);
  } else {
    const login = await call("POST", "/auth/login", {
      email: admin.email,
      password: `definitely-wrong-${Date.now()}`,
    });
    expect(login.status === 401, `expected 401 for wrong password, got ${login.status} ${JSON.stringify(login.body)}`);
    expect(login.body?.message === "Invalid email or password", `unexpected error: ${JSON.stringify(login.body)}`);
    console.log("PASS live login path: user/company lookup and bcrypt comparison execute (wrong password correctly rejected)");
    console.log("NOTE set LIVE_CHECK_PASSWORD to run a positive login without printing the secret");
  }

  const forgot = await call("POST", "/auth/forgot-password", { email: admin.email });
  expect(forgot.status === 201, `forgot-password failed: ${forgot.status}`);
  expect(!forgot.body?.devResetToken, "production mode must not return a reset token");
  console.log("PASS forgot-password generic response; no token exposed in production mode");
} finally {
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}
