// End-to-end verification for Stage 2. Runs against a non-production API and
// a *_test database only. Never point BASE_URL at the live API.
const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4199/api";

let passed = 0;
const failures = [];

function expect(condition, message) {
  if (!condition) {
    failures.push(message);
    console.log(`FAIL  ${message}`);
  } else {
    passed += 1;
    console.log(`PASS  ${message}`);
  }
}

function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async request(method, path, body) {
      const headers = {};
      if (body !== undefined) headers["content-type"] = "application/json";
      if (cookie) headers.cookie = cookie;
      const response = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const pair = raw.split(";")[0];
        if (pair.startsWith("coffee.sid=")) cookie = pair;
      }
      let data = null;
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      return { status: response.status, data };
    },
  };
}

const suffix = `${Date.now()}`.slice(-8);
const password = "Sup3rSecret!Pass1";
const emailA = `owner.a.${suffix}@example.test`;
const emailB = `owner.b.${suffix}@example.test`;
const today = new Date().toISOString().slice(0, 10);

async function main() {
  const anon = client();
  const unauth = await anon.request("GET", "/contacts");
  expect(unauth.status === 401, "Unauthenticated contact list is rejected with 401");

  const a = client();
  const b = client();

  // ---------- Registration ----------
  const regA = await a.request("POST", "/auth/register", {
    companyName: `Acme Coffee ${suffix}`,
    fullName: "Alice Owner",
    email: emailA,
    password,
  });
  expect(regA.status === 201, `Register company A (got ${regA.status})`);
  expect(regA.data?.user?.role === "owner", "Registrant becomes workspace owner (not admin)");
  expect(typeof regA.data?.user?.companyId === "number", "Register returns the new company id");

  const regB = await b.request("POST", "/auth/register", {
    companyName: `Beta Traders ${suffix}`,
    fullName: "Bob Owner",
    email: emailB,
    password,
  });
  expect(regB.status === 201, `Register company B (got ${regB.status})`);
  const companyA = regA.data.user.companyId;
  const companyB = regB.data.user.companyId;
  expect(companyA !== companyB, "Each registration gets an isolated company");

  const duplicate = await anon.request("POST", "/auth/register", {
    companyName: "Duplicate",
    fullName: "Duplicate",
    email: emailA,
    password,
  });
  expect(duplicate.status === 409, "Duplicate email registration is rejected with 409");

  const meA = await a.request("GET", "/auth/me");
  expect(meA.status === 200 && meA.data?.user?.email === emailA, "Session /auth/me returns owner A");
  expect(meA.data?.company?.id === companyA, "/auth/me scopes the company");

  const companyInfo = await a.request("GET", "/company");
  expect(companyInfo.status === 200 && companyInfo.data?.id === companyA, "GET /company returns own company");

  // ---------- Contacts + isolation ----------
  const contactA = await a.request("POST", "/contacts", {
    name: "Hana Supplier",
    phone: "+251900000001",
    roles: ["supplier", "customer"],
  });
  expect(contactA.status === 201, `Company A creates contact (got ${contactA.status})`);
  const contactAId = contactA.data.id;

  const contactB = await b.request("POST", "/contacts", {
    name: "Bekele Buyer",
    phone: "+251900000002",
    roles: ["customer"],
  });
  expect(contactB.status === 201, "Company B creates contact");
  const contactBId = contactB.data.id;

  const listA = await a.request("GET", "/contacts");
  const listB = await b.request("GET", "/contacts");
  expect(listA.data.length === 1, "Company A sees exactly its own contact");
  expect(listB.data.length === 1, "Company B sees exactly its own contact");
  expect(!listB.data.some((c) => c.id === contactAId), "Company A's contact is invisible to company B");

  const crossContact = await b.request("GET", `/contacts/${contactAId}`);
  expect(crossContact.status === 404, "Cross-company contact read returns 404");
  const crossContactWrite = await b.request("PATCH", `/contacts/${contactAId}`, { name: "Hijacked" });
  expect(crossContactWrite.status === 404, "Cross-company contact update returns 404");

  const linkedTx = await a.request("POST", "/transactions", {
    title: "Cross-tenant link",
    kind: "expense",
    amount: "10.00",
    transactionDate: today,
    contactId: contactBId,
  });
  expect(linkedTx.status === 400, "Transaction linking another company's contact is rejected");

  // ---------- Coffee trades ----------
  const tradeA = await a.request("POST", "/coffee-trades", {
    lotNumber: `LOT-${suffix}`,
    grade: "Grade 1",
    weightKg: "120.500",
    moisturePct: "11.5",
    contactId: contactAId,
    tradeType: "purchase",
    tradeDate: today,
  });
  expect(tradeA.status === 201, `Company A records coffee trade (got ${tradeA.status})`);
  const tradeId = tradeA.data.id;

  const tradeDupe = await a.request("POST", "/coffee-trades", {
    lotNumber: `LOT-${suffix}`,
    grade: "Grade 1",
    weightKg: "10.000",
    moisturePct: "11.0",
    contactId: contactAId,
    tradeType: "purchase",
    tradeDate: today,
  });
  expect(tradeDupe.status === 409, "Duplicate lot number in the same company is rejected");

  const tradeB = await b.request("POST", "/coffee-trades", {
    lotNumber: `LOT-${suffix}`,
    grade: "Grade 2",
    weightKg: "80.000",
    moisturePct: "12.0",
    contactId: contactBId,
    tradeType: "sale",
    tradeDate: today,
  });
  expect(tradeB.status === 201, "Same lot number is allowed in a different company");

  const crossTrade = await b.request("GET", `/coffee-trades/${tradeId}`);
  expect(crossTrade.status === 404, "Cross-company coffee trade read returns 404");

  // ---------- Inventory ----------
  const itemA = await a.request("POST", "/inventory", {
    itemName: "Washed Arabica",
    warehouseLocation: "Addis Warehouse A",
    bagCount: 10,
    totalWeightKg: "500.000",
  });
  expect(itemA.status === 201, "Inventory item created");
  const itemAId = itemA.data.id;

  const moveIn = await a.request("POST", `/inventory/${itemAId}/movements`, {
    direction: "in",
    bagQuantity: 5,
    weightKg: "250.000",
    movementDate: today,
    reference: "Opening delivery",
  });
  expect(moveIn.status === 201 && moveIn.data.bagCount === 15, "Stock-in increases bag count");
  expect(Number(moveIn.data.totalWeightKg) === 750, "Stock-in increases weight");

  const moveOut = await a.request("POST", `/inventory/${itemAId}/movements`, {
    direction: "out",
    bagQuantity: 2,
    weightKg: "100.000",
    movementDate: today,
  });
  expect(moveOut.status === 201 && moveOut.data.bagCount === 13, "Stock-out decreases bag count");
  expect(Number(moveOut.data.totalWeightKg) === 650, "Stock-out decreases weight");

  const overdraw = await a.request("POST", `/inventory/${itemAId}/movements`, {
    direction: "out",
    bagQuantity: 999,
    weightKg: "10.000",
    movementDate: today,
  });
  expect(overdraw.status === 400, "Stock-out beyond recorded quantity is rejected");

  // ---------- Vehicles ----------
  const vehicleA = await a.request("POST", "/vehicles", {
    name: "Isuzu Truck",
    registrationNumber: `ET-${suffix}`,
    vehicleType: "Truck",
    driverContactId: contactBId,
    currentMileage: "1000.0",
  });
  expect(vehicleA.status === 400, "Vehicle cannot reference another company's driver");

  const vehicleOk = await a.request("POST", "/vehicles", {
    name: "Isuzu Truck",
    registrationNumber: `ET-${suffix}`,
    vehicleType: "Truck",
    currentMileage: "1000.0",
  });
  expect(vehicleOk.status === 201, "Vehicle created");
  const vehicleId = vehicleOk.data.id;

  const beforeVehicleTx = await a.request("GET", "/transactions");
  const vehicleLog = await a.request("POST", `/vehicles/${vehicleId}/logs`, {
    logType: "fuel",
    description: "Diesel fill",
    mileageKm: "1250.0",
    logDate: today,
    cost: "1500.00",
  });
  expect(vehicleLog.status === 201, "Vehicle fuel log recorded without creating a transaction");
  const afterVehicleTx = await a.request("GET", "/transactions");
  expect(
    afterVehicleTx.data.length === beforeVehicleTx.data.length,
    "Operational log does not auto-create a finance transaction",
  );

  const vehicleList = await a.request("GET", "/vehicles");
  const vehicleRow = vehicleList.data.find((v) => v.id === vehicleId);
  expect(Number(vehicleRow?.currentMileage) === 1250, "Vehicle mileage advances with the log");

  // ---------- Employees ----------
  const employeeA = await a.request("POST", "/employees", {
    fullName: "Meron Clerk",
    phone: "+251911111111",
    jobTitle: "Clerk",
    startDate: "2026-01-15",
  });
  expect(employeeA.status === 201, "Employee created");
  const employeeId = employeeA.data.id;

  const employeeUpdate = await a.request("PATCH", `/employees/${employeeId}`, { isActive: false });
  expect(employeeUpdate.status === 200, "Employee updated");
  const archivedEmployees = await a.request("GET", "/employees?status=archived");
  expect(archivedEmployees.data.some((e) => e.id === employeeId), "Archived employee appears in archived filter");

  // ---------- Processing ----------
  const batchA = await a.request("POST", "/processing-batches", {
    batchCode: `BATCH-${suffix}`,
    inputQuantity: "100.000",
    startedAt: today,
  });
  expect(batchA.status === 201, "Processing batch created");
  const batchId = batchA.data.id;

  const complete = await a.request("PATCH", `/processing-batches/${batchId}/complete`, {
    outputQuantity: "80.000",
    wasteQuantity: "5.000",
  });
  expect(complete.status === 200, "Processing batch completed");

  const completeAgain = await a.request("PATCH", `/processing-batches/${batchId}/complete`, {
    outputQuantity: "70.000",
  });
  expect(completeAgain.status === 400, "Completed batch cannot be completed twice");

  // ---------- Invoices ----------
  const txBeforeInvoice = await a.request("GET", "/transactions");
  const invoiceA = await a.request("POST", "/invoices", {
    invoiceNumber: `INV-${suffix}`,
    partyType: "customer",
    contactId: contactAId,
    issueDate: today,
    dueDate: today,
    subtotal: "1000.00",
    taxAmount: "150.00",
  });
  expect(invoiceA.status === 201, `Invoice created (got ${invoiceA.status})`);
  expect(Number(invoiceA.data.totalAmount) === 1150, "Server computes total = subtotal + tax");
  const invoiceId = invoiceA.data.id;

  const txAfterInvoice = await a.request("GET", "/transactions");
  expect(
    txAfterInvoice.data.length === txBeforeInvoice.data.length,
    "Creating an invoice does not create a finance transaction",
  );

  const invoiceDetail = await a.request("GET", `/invoices/${invoiceId}`);
  expect(invoiceDetail.status === 200, "Invoice detail readable");
  expect(Number(invoiceDetail.data.outstandingBalance) === 1150, "Outstanding balance starts at the total");
  expect(invoiceDetail.data.payments.length === 0, "New invoice has no payments");

  const crossInvoice = await b.request("GET", `/invoices/${invoiceId}`);
  expect(crossInvoice.status === 404, "Cross-company invoice read returns 404");

  const crossPayment = await b.request("POST", `/invoices/${invoiceId}/payments`, {
    amount: "10.00",
    paidAt: today,
  });
  expect(crossPayment.status === 404, "Cross-company payment is rejected");

  const overpay = await a.request("POST", `/invoices/${invoiceId}/payments`, {
    amount: "2000.00",
    paidAt: today,
    paymentMethod: "cash",
  });
  expect(overpay.status === 400, "Payment above the outstanding balance is rejected");

  const payment1 = await a.request("POST", `/invoices/${invoiceId}/payments`, {
    amount: "500.00",
    paidAt: today,
    paymentMethod: "bank_transfer",
    reference: "FT-001",
  });
  expect(payment1.status === 201, `Partial payment recorded (got ${payment1.status})`);
  expect(payment1.data.status === "partially_paid", "Invoice becomes partially_paid");
  expect(Number(payment1.data.outstandingBalance) === 650, "Outstanding balance updates after payment");

  const payments1 = await a.request("GET", `/invoices/${invoiceId}`);
  expect(payments1.data.payments.length === 1, "Invoice payment is linked to one transaction");
  expect(Number(payments1.data.payments[0].amount) === 500, "Payment amount stored on invoice payment");

  const txAfterPayment = await a.request("GET", "/transactions");
  const paymentTx = txAfterPayment.data.find((t) => t.category === "invoice_payment");
  expect(!!paymentTx, "Payment creates exactly one finance transaction");
  expect(paymentTx?.kind === "income", "Customer invoice payment posts as income");
  expect(Number(paymentTx?.amount) === 500, "Finance transaction amount matches the payment");
  expect(
    txAfterPayment.data.filter((t) => t.category === "invoice_payment").length === 1,
    "Invoice has exactly one payment transaction at this point",
  );

  const payment2 = await a.request("POST", `/invoices/${invoiceId}/payments`, {
    amount: "650.00",
    paidAt: today,
    paymentMethod: "cash",
  });
  expect(payment2.data.status === "paid", "Invoice becomes paid after the final payment");
  expect(Number(payment2.data.outstandingBalance) === 0, "Outstanding balance reaches zero");

  const payAfterPaid = await a.request("POST", `/invoices/${invoiceId}/payments`, {
    amount: "10.00",
    paidAt: today,
  });
  expect(payAfterPaid.status === 400, "Payments on a fully paid invoice are rejected");

  const invoiceAgingList = await a.request("GET", "/invoices");
  const paidRow = invoiceAgingList.data.find((i) => i.id === invoiceId);
  expect(paidRow?.status === "paid", "Invoice list reflects paid status");

  const cancelInvoice = await a.request("POST", "/invoices", {
    invoiceNumber: `INV-C-${suffix}`,
    partyType: "supplier",
    contactId: contactAId,
    issueDate: today,
    dueDate: today,
    subtotal: "200.00",
    taxAmount: "0.00",
  });
  expect(cancelInvoice.status === 201, "Second invoice created");
  const cancelled = await a.request("POST", `/invoices/${cancelInvoice.data.id}/cancel`);
  expect(cancelled.status === 201, "Unpaid invoice cancelled");
  const payCancelled = await a.request("POST", `/invoices/${cancelInvoice.data.id}/payments`, {
    amount: "10.00",
    paidAt: today,
  });
  expect(payCancelled.status === 400, "Cancelled invoice rejects payments");

  // ---------- Reports ----------
  const financeA = await a.request("GET", "/reports/finance");
  expect(financeA.status === 200, "Finance report readable");
  expect(Number(financeA.data.transactions.income) === 1150, "Finance report income equals invoice payments");
  expect(Number(financeA.data.transactions.expense) === 0, "Finance report shows no expenses for company A");

  const financeB = await b.request("GET", "/reports/finance");
  expect(Number(financeB.data.transactions.income) === 0, "Company B finance report is isolated");

  const coffeeReport = await a.request("GET", "/reports/coffee-trades");
  expect(coffeeReport.status === 200 && coffeeReport.data.rows.length === 1, "Coffee report groups by grade");
  expect(Number(coffeeReport.data.rows[0].weightKg) === 120.5, "Coffee report sums weight");

  const processingReport = await a.request("GET", "/reports/processing");
  expect(processingReport.status === 200, "Processing report readable");
  expect(processingReport.data.rows.some((r) => r.status === "completed"), "Processing report includes completed batch");

  const inventoryReport = await a.request("GET", "/reports/inventory");
  expect(inventoryReport.status === 200, "Inventory report readable");
  const itemRow = inventoryReport.data.items.find((i) => i.id === itemAId);
  expect(itemRow?.bagCount === 13, "Inventory report reflects current stock");
  expect(itemRow?.receivedBags === 5 && itemRow?.issuedBags === 2, "Inventory report reflects movements");

  const vehicleReport = await a.request("GET", "/reports/vehicles");
  const vehicleRowReport = vehicleReport.data.vehicles.find((v) => v.id === vehicleId);
  expect(Number(vehicleRowReport?.fuelCost) === 1500, "Vehicle report sums fuel cost");
  expect(Number(vehicleRowReport?.maintenanceCost) === 0, "Vehicle report separates maintenance cost");

  const employeeReport = await a.request("GET", "/reports/employees");
  expect(employeeReport.status === 200 && employeeReport.data.totalEmployees === 1, "Employee report counts employees");
  expect(employeeReport.data.activeEmployees === 0, "Employee report tracks archived staff");

  const reportDenied = await anon.request("GET", "/reports/finance");
  expect(reportDenied.status === 401, "Reports require authentication");

  // ---------- Password change / reset ----------
  const changed = await a.request("POST", "/auth/change-password", {
    currentPassword: password,
    newPassword: "An0therSecret!Pass2",
  });
  expect(changed.status === 201, "Change password succeeds");

  const logout = await a.request("POST", "/auth/logout");
  expect(logout.status === 201, "Logout succeeds");
  const afterLogout = await a.request("GET", "/auth/me");
  expect(afterLogout.status === 401, "Session invalid after logout");

  const loginOld = await a.request("POST", "/auth/login", { email: emailA, password });
  expect(loginOld.status === 401, "Old password no longer works");
  const loginNew = await a.request("POST", "/auth/login", {
    email: emailA,
    password: "An0therSecret!Pass2",
  });
  expect(loginNew.status === 201, "Login with the new password succeeds");

  const forgot = await anon.request("POST", "/auth/forgot-password", { email: emailA });
  expect(forgot.status === 201, "Forgot-password returns a response");
  expect(typeof forgot.data.devResetToken === "string", "Dev reset token returned outside production");
  expect(
    (await anon.request("POST", "/auth/forgot-password", { email: `nobody.${suffix}@example.test` })).data
      .devResetToken === undefined,
    "Unknown email does not receive a reset token",
  );

  const reset = await anon.request("POST", "/auth/reset-password", {
    token: forgot.data.devResetToken,
    newPassword: "Th1rdSecret!Pass3",
  });
  expect(reset.status === 201, "Password reset succeeds");
  const reuse = await anon.request("POST", "/auth/reset-password", {
    token: forgot.data.devResetToken,
    newPassword: "F0urthSecret!Pass4",
  });
  expect(reuse.status === 400, "Reset token cannot be reused");
  const loginReset = await anon.request("POST", "/auth/login", {
    email: emailA,
    password: "Th1rdSecret!Pass3",
  });
  expect(loginReset.status === 201, "Login works with the reset password");

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
