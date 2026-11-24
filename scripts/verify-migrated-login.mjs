import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

// Post-migration verification against an isolated copy of the live database.
// Restores access for the existing administrator through the public reset flow
// and confirms the legacy records are visible to them.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
dotenv.config({ path: path.join(root, ".env") });

const DB = process.env.CHECK_DB ?? "coffee_business_manager_restore_test_20261120";
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}/api`;
const NEW_PASSWORD = "LegacyCheck12345";

if (!/^coffee_business_manager_restore_test_\d{8}$/.test(DB)) {
  throw new Error(`Refusing to verify unexpected database name: ${DB}`);
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: DB,
});

const [[admin]] = await connection.query(
  "SELECT u.email, u.company_id AS companyId, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id LIMIT 1",
);
if (!admin) throw new Error("No administrator rows found in the migrated copy");
const [[company]] = await connection.query("SELECT name FROM companies WHERE id = ?", [admin.companyId]);
await connection.end();

const child = spawn(process.execPath, ["dist/main.js"], {
  cwd: path.join(root, "apps/api"),
  env: {
    ...process.env,
    DB_NAME: DB,
    API_PORT: String(PORT),
    NODE_ENV: "test",
    SESSION_SECRET: "migrated-login-verification-secret",
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

  const forgot = await call("POST", "/auth/forgot-password", { email: admin.email });
  expect(forgot.status === 201, `forgot-password failed: ${forgot.status}`);
  expect(forgot.body?.devResetToken, "no reset token returned in test mode");

  const reset = await call("POST", "/auth/reset-password", {
    token: forgot.body.devResetToken,
    newPassword: NEW_PASSWORD,
  });
  expect(reset.status === 201, `reset-password failed: ${reset.status} ${JSON.stringify(reset.body)}`);

  const login = await call("POST", "/auth/login", { email: admin.email, password: NEW_PASSWORD });
  expect(login.status === 201, `legacy admin login failed: ${login.status} ${JSON.stringify(login.body)}`);
  expect(login.body.user.role === "owner" || login.body.user.role === admin.role, "unexpected role");

  const me = await call("GET", "/auth/me");
  expect(me.status === 200 && me.body.company?.name === company.name, "session did not resolve to the legacy workspace");

  const contacts = await call("GET", "/contacts?status=all");
  expect(contacts.status === 200 && contacts.body.length === 3, `expected 3 legacy contacts, got ${contacts.body?.length}`);

  const transactions = await call("GET", "/transactions");
  expect(transactions.status === 200 && transactions.body.length === 3, `expected 3 legacy transactions, got ${transactions.body?.length}`);

  const finance = await call("GET", "/reports/finance");
  const byKind = finance.body.transactions.byKind;
  const total = Object.values(byKind).reduce((sum, row) => sum + Number(row.total), 0);
  expect(total === 555600, `legacy ledger total changed: ${total}`);

  console.log(`PASS legacy admin login: ${admin.email} (role=${login.body.user.role})`);
  console.log(`PASS workspace: ${company.name} (id=${admin.companyId})`);
  console.log("PASS legacy contacts=3 transactions=3 ledger_total=555600.00");
} finally {
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}
