import { spawn } from "node:child_process";
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env") });

// End-to-end API tests. They start a dedicated API instance against an isolated
// test database (never the live database) on a private port.
const ROOT = path.resolve(import.meta.dirname, "../../..");
const PORT = Number(process.env.TEST_API_PORT ?? 4299);
const BASE = `http://127.0.0.1:${PORT}/api`;
const DB = process.env.TEST_DB_NAME ?? "coffee_business_manager_test";
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let api;
let log = "";
let provider;
let mockBase = "";
let providerOnline = true;
let failPrimary = false;
const cacheFile = path.join(os.tmpdir(), `coffee-currency-cache-${run}.json`);

function client(baseUrl = BASE) {
  let cookie = "";
  async function call(method, url, body) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (cookie) headers.cookie = cookie;
    const res = await fetch(baseUrl + url, {
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
  return {
    get: (url) => call("GET", url),
    post: (url, body) => call("POST", url, body),
    patch: (url, body) => call("PATCH", url, body),
    put: (url, body) => call("PUT", url, body),
    del: (url) => call("DELETE", url),
  };
}

function startMockProvider() {
  provider = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    if (!providerOnline) return send(503, { error: "offline" });
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/latest.json") {
      if (failPrimary) return send(500, { error: "primary down" });
      return send(200, { date: "2026-11-20", usd: { etb: 150.25, eur: 0.91 } });
    }
    if (url.pathname === "/fallback.json") {
      return send(200, {
        result: "success",
        rates: { ETB: 151.5 },
        time_last_update_unix: Math.floor(Date.now() / 1000),
      });
    }
    const dated = url.pathname.match(/^\/dated\/(\d{4}-\d{2}-\d{2})\/usd\.json$/);
    if (dated) {
      return send(200, { date: dated[1], usd: { etb: 140 + Number(dated[1].slice(-2)) } });
    }
    return send(404, { error: "not found" });
  });
  return new Promise((resolve) => {
    provider.listen(0, "127.0.0.1", () => {
      mockBase = `http://127.0.0.1:${provider.address().port}`;
      resolve();
    });
  });
}

function ok(res, expected = 201) {
  assert.equal(
    res.status,
    expected,
    `expected ${expected}, got ${res.status}: ${JSON.stringify(res.body)}`,
  );
  return res.body;
}

before(async () => {
  assert.match(
    DB,
    /^coffee_business_manager(_test|_restore_test_\d{8})$/,
    `refusing to point tests at ${DB}`,
  );
  await startMockProvider();
  api = spawn(process.execPath, ["dist/main.js"], {
    cwd: path.join(ROOT, "apps/api"),
    env: {
      ...process.env,
      DB_NAME: DB,
      API_PORT: String(PORT),
      NODE_ENV: "test",
      SESSION_SECRET: `e2e-${run}-session-secret`,
      EXCHANGE_RATE_PRIMARY_URL: `${mockBase}/latest.json`,
      EXCHANGE_RATE_DATED_URL: `${mockBase}/dated/{date}/usd.json`,
      EXCHANGE_RATE_FALLBACK_URL: `${mockBase}/fallback.json`,
      EXCHANGE_RATE_PRIMARY_SOURCE: "Mock currency-api",
      EXCHANGE_RATE_FALLBACK_SOURCE: "Mock fallback provider",
      EXCHANGE_RATE_CACHE_FILE: cacheFile,
      EXCHANGE_RATE_CACHE_TTL_MS: "60000",
      EXCHANGE_RATE_TIMEOUT_MS: "2000",
      EXCHANGE_RATE_REFRESH_THROTTLE_MS: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout.on("data", (d) => (log += d.toString()));
  api.stderr.on("data", (d) => (log += d.toString()));

  const deadline = Date.now() + 30000;
  for (;;) {
    if (api.exitCode !== null) throw new Error(`API exited before start:\n${log}`);
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) {
        const body = await res.json();
        assert.equal(body.database, "connected");
        return;
      }
    } catch {}
    if (Date.now() > deadline) throw new Error(`API did not start in time:\n${log}`);
    await new Promise((r) => setTimeout(r, 300));
  }
});

after(async () => {
  if (api && api.exitCode === null) {
    api.kill();
    await new Promise((resolve) => {
      api.once("exit", resolve);
      setTimeout(resolve, 3000);
    });
  }
  if (provider) {
    await new Promise((resolve) => provider.close(resolve));
  }
  fs.rmSync(cacheFile, { force: true });
});

const state = {};

test("health endpoint reports a connected database", async () => {
  const res = await fetch(`${BASE}/health`);
  ok(res, 200);
});

test("unauthenticated requests are rejected", async () => {
  const anon = client();
  ok(await anon.get("/contacts"), 401);
  ok(await anon.get("/invoices"), 401);
  ok(await anon.get("/transactions"), 401);
  ok(await anon.get("/company"), 401);
});

test("registration creates an isolated workspace owned by the registrant", async () => {
  const a = client();
  state.a = a;
  state.emailA = `e2e-a-${run}@example.com`;
  state.passwordA = "TestPass12345";

  const body = ok(
    await a.post("/auth/register", {
      companyName: `E2E Workspace A ${run}`,
      fullName: "Alice Owner",
      email: state.emailA,
      password: state.passwordA,
    }),
  );
  assert.equal(body.user.role, "owner");
  assert.ok(body.company.id > 1, "registered workspace must not reuse the legacy company");
  state.companyA = body.company;
  state.userA = body.user;

  const me = ok(await a.get("/auth/me"), 200);
  assert.equal(me.user.email, state.emailA);
  assert.equal(me.company.name, `E2E Workspace A ${run}`);
});

test("logout, login, and wrong-password handling", async () => {
  const a = state.a;
  ok(await a.post("/auth/logout"), 201);
  ok(await a.get("/auth/me"), 401);

  ok(
    await a.post("/auth/login", {
      email: state.emailA,
      password: "WrongPass12345",
    }),
    401,
  );

  ok(await a.post("/auth/login", { email: state.emailA, password: state.passwordA }), 201);
  const me = ok(await a.get("/auth/me"), 200);
  assert.equal(me.user.email, state.emailA);
});

test("password change invalidates the old password", async () => {
  const a = state.a;
  ok(
    await a.post("/auth/change-password", {
      currentPassword: state.passwordA,
      newPassword: "ChangedPass12345",
    }),
  );
  ok(await a.post("/auth/logout"), 201);
  ok(await a.post("/auth/login", { email: state.emailA, password: state.passwordA }), 401);
  ok(await a.post("/auth/login", { email: state.emailA, password: "ChangedPass12345" }), 201);
  state.passwordA = "ChangedPass12345";
});

test("forgot/reset password flow works end to end", async () => {
  const a = state.a;
  const forgot = ok(await a.post("/auth/forgot-password", { email: state.emailA }));
  assert.match(forgot.devResetToken, /^[a-f0-9]{64}$/);

  ok(
    await a.post("/auth/reset-password", {
      token: forgot.devResetToken,
      newPassword: "ResetPass12345",
    }),
  );
  ok(await a.post("/auth/logout"), 201);
  ok(await a.post("/auth/login", { email: state.emailA, password: "ChangedPass12345" }), 401);
  ok(await a.post("/auth/login", { email: state.emailA, password: "ResetPass12345" }), 201);
  state.passwordA = "ResetPass12345";
});

test("contacts CRUD, archive, and restore", async () => {
  const a = state.a;

  const supplier = ok(
    await a.post("/contacts", {
      name: `Supplier ${run}`,
      phone: "0911000000",
      roles: ["supplier"],
    }),
  );
  state.supplierId = supplier.id;
  ok(await a.post("/contacts", { name: "No Role", roles: [] }), 400);

  const customer = ok(
    await a.post("/contacts", {
      name: `Customer ${run}`,
      email: `customer-${run}@example.com`,
      roles: ["customer"],
    }),
  );
  state.customerId = customer.id;

  const updated = ok(
    await a.patch(`/contacts/${state.supplierId}`, { name: `Supplier Renamed ${run}` }),
    200,
  );
  assert.equal(updated.name, `Supplier Renamed ${run}`);

  ok(await a.post(`/contacts/${state.supplierId}/archive`, {}), 201);
  const archived = ok(await a.get("/contacts?status=archived"), 200);
  assert.ok(archived.some((c) => c.id === state.supplierId));
  ok(await a.post(`/contacts/${state.supplierId}/restore`, {}), 201);
  ok(await a.get(`/contacts/${state.supplierId}`), 200);
});

test("coffee trades are created, listed, updated, and de-duplicated by lot", async () => {
  const a = state.a;
  state.lot = `LOT-${run}`;
  const trade = ok(
    await a.post("/coffee-trades", {
      lotNumber: state.lot,
      grade: "Grade 1",
      weightKg: "500.500",
      moisturePct: "11.5",
      contactId: state.supplierId,
      tradeType: "purchase",
      tradeDate: "2026-11-01",
    }),
  );
  state.tradeId = trade.id;

  ok(
    await a.post("/coffee-trades", {
      lotNumber: state.lot,
      grade: "Grade 2",
      weightKg: "10",
      moisturePct: "10",
      contactId: state.supplierId,
      tradeType: "purchase",
      tradeDate: "2026-11-01",
    }),
    409,
  );
  ok(await a.patch(`/coffee-trades/${state.tradeId}`, { grade: "Grade 1 Special" }), 200);

  const list = ok(await a.get("/coffee-trades"), 200);
  assert.ok(list.some((t) => t.id === state.tradeId && t.grade === "Grade 1 Special"));
});

test("processing batches are created and completed", async () => {
  const a = state.a;
  const batch = ok(
    await a.post("/processing-batches", {
      batchCode: `BATCH-${run}`,
      inputQuantity: "100.000",
      startedAt: "2026-11-02",
    }),
  );
  state.batchId = batch.id;

  ok(await a.patch(`/processing-batches/${batch.id}/complete`, { outputQuantity: "140" }), 400);
  ok(
    await a.patch(`/processing-batches/${batch.id}/complete`, {
      outputQuantity: "82.500",
      wasteQuantity: "17.500",
      processingMethod: "washed",
    }),
    200,
  );

  const list = ok(await a.get("/processing-batches?status=completed"), 200);
  const row = list.find((b) => b.id === batch.id);
  assert.ok(row);
  assert.equal(Number(row.outputQuantity), 82.5);
});

test("inventory items track stock movements and reject overdraws", async () => {
  const a = state.a;
  const item = ok(
    await a.post("/inventory", {
      itemName: `Green Beans ${run}`,
      warehouseLocation: "Warehouse A",
      bagCount: 10,
      totalWeightKg: "600.000",
    }),
  );
  state.inventoryId = item.id;

  ok(
    await a.post(`/inventory/${item.id}/movements`, {
      direction: "out",
      bagQuantity: 4,
      weightKg: "240.000",
      movementDate: "2026-11-03",
    }),
  );
  const overdraw = await a.post(`/inventory/${item.id}/movements`, {
    direction: "out",
    bagQuantity: 100,
    weightKg: "1.000",
    movementDate: "2026-11-03",
  });
  ok(overdraw, 400);

  const list = ok(await a.get("/inventory"), 200);
  const row = list.find((i) => i.id === item.id);
  assert.equal(Number(row.bagCount), 6);

  const movements = ok(await a.get(`/inventory/${item.id}/movements`), 200);
  assert.equal(movements.length, 1);
});

test("vehicles and vehicle logs are recorded per workspace", async () => {
  const a = state.a;
  state.reg = `AA-${run.slice(-5)}`;
  const vehicle = ok(
    await a.post("/vehicles", {
      name: "Delivery Truck",
      registrationNumber: state.reg,
      currentMileage: "1000",
      status: "active",
    }),
  );
  state.vehicleId = vehicle.id;

  ok(
    await a.post("/vehicles", {
      name: "Duplicate",
      registrationNumber: state.reg,
      currentMileage: "0",
      status: "active",
    }),
    409,
  );
  ok(
    await a.post(`/vehicles/${vehicle.id}/logs`, {
      logType: "fuel",
      description: "Full tank",
      mileageKm: "1500",
      logDate: "2026-11-04",
      cost: "4500.00",
    }),
  );

  const list = ok(await a.get("/vehicles"), 200);
  const row = list.find((v) => v.id === vehicle.id);
  assert.equal(Number(row.currentMileage), 1500);
  assert.equal(Number(row.currentMileage) >= 1500, true);
});

test("employees are created and updated", async () => {
  const a = state.a;
  const employee = ok(
    await a.post("/employees", {
      fullName: `Employee ${run}`,
      jobTitle: "Roaster",
      startDate: "2026-01-05",
    }),
  );
  state.employeeId = employee.id;
  ok(await a.patch(`/employees/${employee.id}`, { jobTitle: "Head Roaster" }), 200);
  const list = ok(await a.get("/employees?status=all"), 200);
  assert.ok(list.some((e) => e.id === employee.id && e.jobTitle === "Head Roaster"));
});

test("finance transactions are tenant-scoped and validate linked records", async () => {
  const a = state.a;
  const tx = ok(
    await a.post("/transactions", {
      title: `Consulting income ${run}`,
      kind: "income",
      amount: "2500.00",
      transactionDate: "2026-11-05",
      contactId: state.customerId,
      paymentMethod: "bank_transfer",
      coffeeTradeId: state.tradeId,
    }),
  );
  state.txId = tx.id;
  state.incomeTxId = tx.id;

  ok(
    await a.post("/transactions", {
      title: "Bad link",
      kind: "expense",
      amount: "10.00",
      transactionDate: "2026-11-05",
      coffeeTradeId: 99999999,
    }),
    400,
  );

  const list = ok(await a.get("/transactions"), 200);
  assert.ok(list.some((t) => t.id === tx.id));
});

test("invoices never create transactions and payments post explicit ledger entries", async () => {
  const a = state.a;
  state.invoiceNumber = `INV-${run}`;
  const invoice = ok(
    await a.post("/invoices", {
      invoiceNumber: state.invoiceNumber,
      partyType: "customer",
      contactId: state.customerId,
      issueDate: "2026-11-06",
      dueDate: "2026-12-06",
      subtotal: "1000.00",
      taxAmount: "150.00",
    }),
  );
  state.invoiceId = invoice.id;
  assert.equal(Number(invoice.totalAmount), 1150);
  assert.equal(Number(invoice.outstandingBalance), 1150);

  const before = ok(
    await a.get(`/transactions?q=${encodeURIComponent("Payment for invoice")}`),
    200,
  );
  assert.equal(before.length, 0, "creating an invoice must not create a financial transaction");

  ok(
    await a.post("/invoices", {
      invoiceNumber: state.invoiceNumber,
      partyType: "customer",
      contactId: state.customerId,
      issueDate: "2026-11-06",
      dueDate: "2026-12-06",
      subtotal: "1.00",
    }),
    409,
  );

  const partial = ok(
    await a.post(`/invoices/${invoice.id}/payments`, {
      amount: "500.00",
      paidAt: "2026-11-07",
      paymentMethod: "cash",
    }),
  );
  assert.equal(Number(partial.amountPaid), 500);
  assert.equal(Number(partial.outstandingBalance), 650);
  assert.equal(partial.status, "partially_paid");

  const paymentTx = ok(
    await a.get(`/transactions?q=${encodeURIComponent("Payment for invoice")}`),
    200,
  );
  assert.equal(paymentTx.length, 1);
  assert.equal(Number(paymentTx[0].amount), 500);
  assert.equal(paymentTx[0].reference, state.invoiceNumber);

  ok(
    await a.post(`/invoices/${invoice.id}/payments`, {
      amount: "700.00",
      paidAt: "2026-11-08",
      paymentMethod: "cash",
    }),
    400,
  );

  const final = ok(
    await a.post(`/invoices/${invoice.id}/payments`, {
      amount: "650.00",
      paidAt: "2026-11-08",
      paymentMethod: "bank_transfer",
    }),
  );
  assert.equal(final.status, "paid");
  assert.equal(Number(final.outstandingBalance), 0);

  ok(
    await a.post(`/invoices/${invoice.id}/payments`, {
      amount: "1.00",
      paidAt: "2026-11-09",
    }),
    400,
  );
  ok(await a.post(`/invoices/${invoice.id}/cancel`, {}), 400);

  const detail = ok(await a.get(`/invoices/${invoice.id}`), 200);
  assert.equal(detail.payments.length, 2);
  assert.equal(Number(detail.outstandingBalance), 0);

  const second = ok(
    await a.post("/invoices", {
      invoiceNumber: `INV-CANCEL-${run}`,
      partyType: "supplier",
      contactId: state.supplierId,
      issueDate: "2026-11-09",
      dueDate: "2026-11-30",
      subtotal: "300.00",
    }),
  );
  ok(await a.post(`/invoices/${second.id}/cancel`, {}));
  ok(
    await a.post(`/invoices/${second.id}/payments`, { amount: "10.00", paidAt: "2026-11-10" }),
    400,
  );
});

test("reports reflect the workspace's own data", async () => {
  const a = state.a;
  const finance = ok(await a.get("/reports/finance"), 200);
  assert.equal(finance.transactions.income, 3650);
  assert.equal(finance.transactions.expense, 0);
  const paidRow = finance.invoices.find((r) => r.status === "paid");
  assert.ok(paidRow);
  assert.equal(paidRow.total, 1150);
  assert.equal(paidRow.paid, 1150);

  const coffee = ok(await a.get("/reports/coffee-trades"), 200);
  assert.ok(coffee.rows.some((r) => r.tradeType === "purchase" && r.lots >= 1));

  const processing = ok(await a.get("/reports/processing"), 200);
  assert.ok(processing.rows.some((r) => r.status === "completed"));

  const inventory = ok(await a.get("/reports/inventory"), 200);
  assert.ok(inventory.items.some((i) => i.id === state.inventoryId));

  const vehicles = ok(await a.get("/reports/vehicles"), 200);
  const v = vehicles.vehicles.find((row) => row.id === state.vehicleId);
  assert.equal(v.fuelCost, 4500);

  const employees = ok(await a.get("/reports/employees"), 200);
  assert.ok(employees.employees.some((e) => e.id === state.employeeId));
});

test("a second workspace cannot read or link the first workspace's records", async () => {
  const b = client();
  ok(
    await b.post("/auth/register", {
      companyName: `E2E Workspace B ${run}`,
      fullName: "Bob Owner",
      email: `e2e-b-${run}@example.com`,
      password: "SecondPass12345",
    }),
  );

  const bContact = ok(
    await b.post("/contacts", { name: `B Contact ${run}`, roles: ["customer"] }),
  );

  ok(await b.get(`/contacts/${state.supplierId}`), 404);
  ok(await b.get(`/coffee-trades/${state.tradeId}`), 404);
  ok(await b.get(`/processing-batches/${state.batchId}`), 404);
  ok(await b.get(`/vehicles/${state.vehicleId}/logs`), 404);
  ok(await b.get(`/employees/${state.employeeId}`), 404);
  ok(await b.get(`/invoices/${state.invoiceId}`), 404);
  ok(
    await b.post(`/invoices/${state.invoiceId}/payments`, {
      amount: "1.00",
      paidAt: "2026-11-11",
    }),
    404,
  );

  ok(
    await b.post("/transactions", {
      title: "Cross-tenant link",
      kind: "expense",
      amount: "10.00",
      transactionDate: "2026-11-11",
      contactId: state.supplierId,
    }),
    400,
  );
  ok(
    await b.post("/coffee-trades", {
      lotNumber: "CROSS-1",
      grade: "Grade 1",
      weightKg: "5",
      moisturePct: "10",
      contactId: state.supplierId,
      tradeType: "purchase",
      tradeDate: "2026-11-11",
    }),
    400,
  );

  const contactsB = ok(await b.get("/contacts?status=all"), 200);
  assert.ok(!contactsB.some((c) => c.id === state.supplierId));
  assert.ok(contactsB.some((c) => c.id === bContact.id));

  const invoicesB = ok(await b.get("/invoices"), 200);
  assert.ok(!invoicesB.some((i) => i.id === state.invoiceId));

  const transactionsB = ok(await b.get("/transactions"), 200);
  assert.equal(transactionsB.length, 0);

  const financeB = ok(await b.get("/reports/finance"), 200);
  assert.equal(financeB.transactions.income, 0);
  assert.equal(financeB.invoices.length, 0);

  const companyB = ok(await b.get("/company"), 200);
  assert.equal(companyB.name, `E2E Workspace B ${run}`);

  ok(await b.patch("/company", { name: `Renamed B ${run}` }), 200);
  const companyA = ok(await state.a.get("/company"), 200);
  assert.equal(companyA.name, `E2E Workspace A ${run}`);
});

test("sessions are bound to a single user across separate workspaces", async () => {
  const a = client();
  ok(await a.post("/auth/login", { email: state.emailA, password: state.passwordA }), 201);
  const me = ok(await a.get("/auth/me"), 200);
  assert.equal(me.company.id, state.companyA.id);
  assert.equal(me.user.id, state.userA.id);
});

async function waitForHealth(baseUrl, child, label) {
  const deadline = Date.now() + 30000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`${label} exited before start:\n${log}`);
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        const body = await res.json();
        assert.equal(body.database, "connected");
        return;
      }
    } catch {}
    if (Date.now() > deadline) throw new Error(`${label} did not start in time:\n${log}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function connectTestDb() {
  const mysql = (await import("mysql2/promise")).default;
  return mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: DB,
  });
}

test("currency: provider fetch, caching, history, overrides and isolation", async () => {
  const a = client();
  const b = client();
  ok(await a.post("/auth/login", { email: state.emailA, password: state.passwordA }), 201);
  ok(
    await b.post("/auth/login", {
      email: `e2e-b-${run}@example.com`,
      password: "SecondPass12345",
    }),
    201,
  );

  const anon = client();
  ok(await anon.get("/exchange-rates"), 401);

  const meA = ok(await a.get("/auth/me"), 200);
  assert.ok(meA.permissions.includes("currency.view"));
  assert.ok(meA.permissions.includes("currency.override"));
  const meB = ok(await b.get("/auth/me"), 200);
  assert.ok(meB.permissions.includes("currency.override"));

  const txCountBefore = ok(await a.get("/transactions"), 200).length;
  const db = await connectTestDb();
  let seededRateId = null;
  try {
    const seededDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const [inserted] = await db.execute(
      "INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date) VALUES (?, ?, ?, ?)",
      ["USD", "ETB", "145.75000000", seededDate],
    );
    seededRateId = inserted.insertId;

    const latest = ok(await a.get("/exchange-rates"), 200);
    assert.equal(latest.pair, "USD/ETB");
    assert.equal(latest.rate, 150.25);
    assert.equal(latest.indicative, true);
    assert.equal(latest.manual, false);
    assert.equal(latest.stale, false);
    assert.equal(latest.bankBuy, null);
    assert.equal(latest.bankSell, null);
    assert.ok(latest.fetchedAt);
    assert.match(latest.source, /Mock currency-api/);
    assert.ok(Math.abs(latest.inverseRate - 1 / 150.25) < 1e-9);

    failPrimary = true;
    const fallback = ok(await a.get("/exchange-rates?refresh=1"), 200);
    assert.equal(fallback.rate, 151.5);
    assert.match(fallback.source, /fallback/i);
    failPrimary = false;

    const recovered = ok(await a.get("/exchange-rates?refresh=1"), 200);
    assert.equal(recovered.rate, 150.25);
    assert.match(recovered.source, /Mock currency-api/);

    const history = ok(await a.get("/exchange-rates/history?days=30&refresh=1"), 200);
    assert.equal(history.pair, "USD/ETB");
    assert.equal(history.indicative, true);
    assert.ok(history.points.length >= 2);
    assert.ok(history.points.some((point) => /database/i.test(point.source)));
    assert.ok(history.points.every((point) => point.rate > 0));

    const saved = ok(
      await a.put("/exchange-rates/override", {
        rate: 155.5,
        bankBuy: 150,
        bankSell: 160,
        note: "Branch counter rate",
      }),
      200,
    );
    assert.equal(saved.manual, true);
    assert.equal(saved.rate, 155.5);
    assert.equal(saved.marketRate, 150.25);
    assert.equal(saved.source, "Manual override");
    assert.equal(saved.bankBuy, 150);
    assert.equal(saved.bankSell, 160);
    assert.equal(saved.bankRatesSource, "manual");
    assert.equal(saved.override.note, "Branch counter rate");

    const aOverride = ok(await a.get("/exchange-rates?refresh=1"), 200);
    assert.equal(aOverride.rate, 155.5);
    assert.equal(aOverride.marketRate, 150.25);
    assert.equal(aOverride.manual, true);

    const bMarket = ok(await b.get("/exchange-rates"), 200);
    assert.equal(bMarket.rate, 150.25);
    assert.equal(bMarket.manual, false);

    const bOverride = ok(await b.put("/exchange-rates/override", { rate: 165 }), 200);
    assert.equal(bOverride.rate, 165);
    assert.equal(bOverride.manual, true);

    const aStill = ok(await a.get("/exchange-rates"), 200);
    assert.equal(aStill.rate, 155.5);
    const bStill = ok(await b.get("/exchange-rates"), 200);
    assert.equal(bStill.rate, 165);

    assert.equal(
      (await a.put("/exchange-rates/override", { rate: 0 })).status,
      400,
    );
    assert.equal(
      (await a.put("/exchange-rates/override", { rate: 150, bankBuy: 160, bankSell: 155 }))
        .status,
      400,
    );

    const [rows] = await db.execute("SELECT role_id FROM users WHERE id = ?", [state.userA.id]);
    const originalRoleId = rows[0].role_id;
    const [staffRows] = await db.execute("SELECT id FROM roles WHERE name = ?", ["staff"]);
    assert.ok(staffRows.length > 0);

    try {
      await db.execute("UPDATE users SET role_id = ? WHERE id = ?", [
        staffRows[0].id,
        state.userA.id,
      ]);
      const staffMe = ok(await a.get("/auth/me"), 200);
      assert.equal(staffMe.user.role, "staff");
      assert.ok(staffMe.permissions.includes("currency.view"));
      assert.ok(!staffMe.permissions.includes("currency.override"));
      assert.equal(
        (await a.put("/exchange-rates/override", { rate: 158 })).status,
        403,
      );
      const stillReadable = ok(await a.get("/exchange-rates"), 200);
      assert.equal(stillReadable.rate, 155.5);
    } finally {
      await db.execute("UPDATE users SET role_id = ? WHERE id = ?", [
        originalRoleId,
        state.userA.id,
      ]);
    }

    const aBeforeOffline = ok(await a.get("/exchange-rates"), 200);
    providerOnline = false;

    const aOffline = ok(await a.get("/exchange-rates?refresh=1"), 200);
    assert.equal(aOffline.stale, true);
    assert.equal(aOffline.rate, 155.5);
    assert.equal(aOffline.fetchedAt, aBeforeOffline.fetchedAt);

    const bOffline = ok(await b.get("/exchange-rates?refresh=1"), 200);
    assert.equal(bOffline.stale, true);
    assert.equal(bOffline.rate, 165);

    const historyOffline = ok(await a.get("/exchange-rates/history?days=30"), 200);
    assert.ok(historyOffline.points.length >= 2);

    const clearedB = ok(await b.del("/exchange-rates/override"), 200);
    assert.equal(clearedB.manual, false);
    assert.equal(clearedB.rate, 150.25);

    const clearedA = ok(await a.del("/exchange-rates/override"), 200);
    assert.equal(clearedA.manual, false);
    assert.equal(clearedA.rate, 150.25);

    assert.equal(ok(await a.get("/transactions"), 200).length, txCountBefore);

    const secondPort = PORT + 1;
    const secondBase = `http://127.0.0.1:${secondPort}/api`;
    const freshCache = path.join(os.tmpdir(), `coffee-currency-cache-fresh-${run}.json`);
    let second = null;
    try {
      second = spawn(process.execPath, ["dist/main.js"], {
        cwd: path.join(ROOT, "apps/api"),
        env: {
          ...process.env,
          DB_NAME: DB,
          API_PORT: String(secondPort),
          NODE_ENV: "test",
          SESSION_SECRET: `e2e-${run}-second-secret`,
          EXCHANGE_RATE_PRIMARY_URL: `${mockBase}/latest.json`,
          EXCHANGE_RATE_DATED_URL: `${mockBase}/dated/{date}/usd.json`,
          EXCHANGE_RATE_FALLBACK_URL: `${mockBase}/fallback.json`,
          EXCHANGE_RATE_CACHE_FILE: freshCache,
          EXCHANGE_RATE_TIMEOUT_MS: "1000",
          EXCHANGE_RATE_REFRESH_THROTTLE_MS: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      second.stdout.on("data", (d) => (log += d.toString()));
      second.stderr.on("data", (d) => (log += d.toString()));
      await waitForHealth(secondBase, second, "second API instance");

      const offlineBrowser = client(secondBase);
      ok(
        await offlineBrowser.post("/auth/login", {
          email: state.emailA,
          password: state.passwordA,
        }),
        201,
      );
      const offlineLatest = await offlineBrowser.get("/exchange-rates");
      assert.equal(offlineLatest.status, 503);
      assert.match(String(offlineLatest.body?.message ?? ""), /unavailable/i);
    } finally {
      if (second && second.exitCode === null) {
        second.kill();
        await new Promise((resolve) => {
          second.once("exit", resolve);
          setTimeout(resolve, 3000);
        });
      }
      fs.rmSync(freshCache, { force: true });
    }
  } finally {
    providerOnline = true;
    failPrimary = false;
    if (seededRateId !== null) {
      await db.execute("DELETE FROM exchange_rates WHERE id = ?", [seededRateId]);
    }
    await db.end();
  }
});
