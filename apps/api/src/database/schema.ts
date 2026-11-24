import { mysqlTable, int, varchar, text, timestamp, datetime, decimal, boolean, json, mysqlEnum, index, uniqueIndex, foreignKey, check } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Tenancy root. Every tenant-owned row carries company_id; reference data (roles, currencies,
// exchange rates, contact types, permissions) stays global.
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  status: mysqlEnum("status", ["active", "suspended"]).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const roles = mysqlTable("roles", { id: int("id").autoincrement().primaryKey(), name: varchar("name", { length: 60 }).notNull().unique(), description: varchar("description", { length: 255 }) });

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  email: varchar("email", { length: 190 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  roleId: int("role_id").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordChangedAt: datetime("password_changed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [index("users_company_id_idx").on(t.companyId)]);

export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 190 }),
  address: text("address"),
  notes: text("notes"),
  roles: json("roles").$type<string[]>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("contacts_name_idx").on(t.name),
  index("contacts_company_id_idx").on(t.companyId),
  index("contacts_company_name_idx").on(t.companyId, t.name),
  uniqueIndex("contacts_company_id_id_unique").on(t.companyId, t.id),
]);

export const currencies = mysqlTable("currencies", { code: varchar("code", { length: 3 }).primaryKey(), name: varchar("name", { length: 80 }).notNull(), symbol: varchar("symbol", { length: 8 }), isBase: boolean("is_base").notNull().default(false), isActive: boolean("is_active").notNull().default(true) });
export const exchangeRates = mysqlTable("exchange_rates", { id: int("id").autoincrement().primaryKey(), fromCurrency: varchar("from_currency", { length: 3 }).notNull(), toCurrency: varchar("to_currency", { length: 3 }).notNull(), rate: decimal("rate", { precision: 20, scale: 8 }).notNull(), effectiveDate: datetime("effective_date").notNull(), createdAt: timestamp("created_at").defaultNow().notNull() });

export const financialAccounts = mysqlTable("financial_accounts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 120 }).notNull(),
  accountType: mysqlEnum("account_type", ["cash", "bank"]).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("ETB"),
  openingBalance: decimal("opening_balance", { precision: 18, scale: 2 }).notNull().default("0.00"),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [index("financial_accounts_company_id_idx").on(t.companyId)]);

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  publicId: varchar("public_id", { length: 64 }).notNull().unique(),
  contactId: int("contact_id"),
  direction: mysqlEnum("direction", ["received", "made"]).notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  paymentMethod: mysqlEnum("payment_method", ["cash", "bank_transfer"]).notNull(),
  financialAccountId: int("financial_account_id"),
  paymentDate: datetime("payment_date").notNull(),
  reference: varchar("reference", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("payments_company_id_idx").on(t.companyId)]);

export const paymentAllocations = mysqlTable("payment_allocations", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  paymentId: int("payment_id").notNull(),
  transactionId: int("transaction_id").notNull(),
  allocatedAmount: decimal("allocated_amount", { precision: 18, scale: 2 }).notNull(),
}, (t) => [index("payment_allocations_company_id_idx").on(t.companyId)]);

export const loans = mysqlTable("loans", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  contactId: int("contact_id").notNull(),
  direction: mysqlEnum("direction", ["given", "received"]).notNull(),
  principal: decimal("principal", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 8, scale: 4 }).default("0"),
  startDate: datetime("start_date").notNull(),
  dueDate: datetime("due_date"),
  status: mysqlEnum("status", ["open", "partially_paid", "settled"]).notNull().default("open"),
  notes: text("notes"),
}, (t) => [index("loans_company_id_idx").on(t.companyId)]);

export const loanPayments = mysqlTable("loan_payments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  loanId: int("loan_id").notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  paidAt: datetime("paid_at").notNull(),
  financialAccountId: int("financial_account_id"),
}, (t) => [index("loan_payments_company_id_idx").on(t.companyId)]);

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 120 }).notNull(),
  category: varchar("category", { length: 80 }),
  unit: varchar("unit", { length: 30 }).notNull().default("kg"),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [index("products_company_id_idx").on(t.companyId)]);

export const purchases = mysqlTable("purchases", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  contactId: int("contact_id").notNull(),
  productId: int("product_id").notNull(),
  quantity: decimal("quantity", { precision: 18, scale: 3 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  purchaseDate: datetime("purchase_date").notNull(),
  notes: text("notes"),
}, (t) => [index("purchases_company_id_idx").on(t.companyId)]);

export const sales = mysqlTable("sales", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  contactId: int("contact_id").notNull(),
  productId: int("product_id").notNull(),
  quantity: decimal("quantity", { precision: 18, scale: 3 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  saleDate: datetime("sale_date").notNull(),
  notes: text("notes"),
}, (t) => [index("sales_company_id_idx").on(t.companyId)]);

export const inventoryItems = mysqlTable("inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  itemName: varchar("item_name", { length: 160 }).notNull(),
  warehouseLocation: varchar("warehouse_location", { length: 160 }).notNull(),
  bagCount: int("bag_count").notNull().default(0),
  totalWeightKg: decimal("total_weight_kg", { precision: 14, scale: 3 }).notNull().default("0.000"),
  createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("inventory_items_company_id_idx").on(t.companyId),
  index("inventory_items_company_warehouse_idx").on(t.companyId, t.warehouseLocation),
  index("inventory_items_company_name_idx").on(t.companyId, t.itemName),
  uniqueIndex("inventory_items_company_id_id_unique").on(t.companyId, t.id),
  check("inventory_items_nonnegative", sql`bag_count >= 0 AND total_weight_kg >= 0`),
]);

export const inventoryMovements = mysqlTable("inventory_movements", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  productId: int("product_id").notNull(),
  movementType: mysqlEnum("movement_type", ["purchase", "processing_input", "processing_output", "sale", "adjustment"]).notNull(),
  quantityIn: decimal("quantity_in", { precision: 18, scale: 3 }).notNull().default("0"),
  quantityOut: decimal("quantity_out", { precision: 18, scale: 3 }).notNull().default("0"),
  referenceType: varchar("reference_type", { length: 40 }),
  referenceId: int("reference_id"),
  occurredAt: datetime("occurred_at").notNull(),
  notes: text("notes"),
}, (t) => [index("inventory_movements_company_id_idx").on(t.companyId)]);

export const machines = mysqlTable("machines", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 120 }).notNull(),
  model: varchar("model", { length: 120 }),
  serialNumber: varchar("serial_number", { length: 120 }),
  status: mysqlEnum("status", ["active", "maintenance", "inactive"]).notNull().default("active"),
  notes: text("notes"),
}, (t) => [index("machines_company_id_idx").on(t.companyId)]);

export const processingBatches = mysqlTable("processing_batches", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  batchCode: varchar("batch_code", { length: 80 }).notNull(),
  machineId: int("machine_id").references(() => machines.id, { onDelete: "set null" }),
  operatorContactId: int("operator_contact_id"),
  inputProductId: int("input_product_id").references(() => products.id, { onDelete: "set null" }),
  inputQuantity: decimal("input_quantity", { precision: 18, scale: 3 }).notNull(),
  outputQuantity: decimal("output_quantity", { precision: 18, scale: 3 }),
  processingMethod: mysqlEnum("processing_method", ["washed", "natural", "other"]),
  startedAt: datetime("started_at").notNull(),
  completedAt: datetime("completed_at"),
  wasteQuantity: decimal("waste_quantity", { precision: 18, scale: 3 }).default("0"),
  status: mysqlEnum("status", ["planned", "running", "completed", "cancelled"]).notNull().default("planned"),
  notes: text("notes"),
  createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("processing_batches_company_batch_code_unique").on(t.companyId, t.batchCode),
  index("processing_batches_company_id_idx").on(t.companyId),
  index("processing_batches_company_started_idx").on(t.companyId, t.startedAt),
  check("processing_batches_quantities_valid", sql`input_quantity > 0 AND (output_quantity IS NULL OR (output_quantity >= 0 AND output_quantity <= input_quantity))`),
]);

export const processingOutputs = mysqlTable("processing_outputs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  batchId: int("batch_id").notNull().references(() => processingBatches.id, { onDelete: "cascade" }),
  productId: int("product_id").notNull().references(() => products.id),
  quantity: decimal("quantity", { precision: 18, scale: 3 }).notNull(),
}, (t) => [index("processing_outputs_company_id_idx").on(t.companyId)]);

export const coffeeTrades = mysqlTable("coffee_trades", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  lotNumber: varchar("lot_number", { length: 80 }).notNull(),
  grade: varchar("grade", { length: 60 }).notNull(),
  weightKg: decimal("weight_kg", { precision: 14, scale: 3 }).notNull(),
  moisturePct: decimal("moisture_pct", { precision: 5, scale: 2 }).notNull(),
  contactId: int("contact_id").notNull(),
  tradeType: mysqlEnum("trade_type", ["purchase", "sale"]).notNull(),
  tradeDate: datetime("trade_date").notNull(),
  notes: text("notes"),
  createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("coffee_trades_company_lot_unique").on(t.companyId, t.lotNumber),
  index("coffee_trades_company_id_idx").on(t.companyId),
  index("coffee_trades_company_date_idx").on(t.companyId, t.tradeDate),
  index("coffee_trades_company_grade_idx").on(t.companyId, t.grade),
  foreignKey({
    columns: [t.companyId, t.contactId],
    foreignColumns: [contacts.companyId, contacts.id],
    name: "coffee_trades_company_contact_fk",
  }).onDelete("restrict"),
  check("coffee_trades_values_valid", sql`weight_kg > 0 AND moisture_pct >= 0 AND moisture_pct <= 100`),
]);

export const stockMovements = mysqlTable("stock_movements", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  inventoryItemId: int("inventory_item_id").notNull(),
  direction: mysqlEnum("direction", ["in", "out"]).notNull(),
  bagQuantity: int("bag_quantity").notNull().default(0),
  weightKg: decimal("weight_kg", { precision: 14, scale: 3 }).notNull(),
  movementDate: datetime("movement_date").notNull(),
  reference: varchar("reference", { length: 255 }),
  createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("stock_movements_company_id_idx").on(t.companyId),
  index("stock_movements_company_item_date_idx").on(t.companyId, t.inventoryItemId, t.movementDate),
  foreignKey({
    columns: [t.companyId, t.inventoryItemId],
    foreignColumns: [inventoryItems.companyId, inventoryItems.id],
    name: "stock_movements_company_item_fk",
  }).onDelete("restrict"),
  check("stock_movements_values_valid", sql`bag_quantity >= 0 AND weight_kg > 0`),
]);

export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 100 }).notNull(),
  registrationNumber: varchar("registration_number", { length: 60 }).notNull(),
  vehicleType: varchar("vehicle_type", { length: 60 }),
  driverContactId: int("driver_contact_id"),
  currentMileage: decimal("current_mileage", { precision: 12, scale: 1 }).notNull().default("0.0"),
  status: mysqlEnum("status", ["active", "maintenance", "inactive"]).notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("vehicles_company_registration_unique").on(t.companyId, t.registrationNumber),
  index("vehicles_company_id_idx").on(t.companyId),
  uniqueIndex("vehicles_company_id_id_unique").on(t.companyId, t.id),
  index("vehicles_company_status_idx").on(t.companyId, t.status),
  foreignKey({
    columns: [t.companyId, t.driverContactId],
    foreignColumns: [contacts.companyId, contacts.id],
    name: "vehicles_company_driver_fk",
  }).onDelete("restrict"),
  check("vehicles_mileage_nonnegative", sql`current_mileage >= 0`),
]);

export const vehicleLogs = mysqlTable("vehicle_logs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  vehicleId: int("vehicle_id").notNull(),
  logType: mysqlEnum("log_type", ["maintenance", "fuel"]).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  mileageKm: decimal("mileage_km", { precision: 12, scale: 1 }).notNull(),
  logDate: datetime("log_date").notNull(),
  cost: decimal("cost", { precision: 18, scale: 2 }),
  currency: varchar("currency", { length: 3 }).notNull().default("ETB"),
  notes: text("notes"),
  createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("vehicle_logs_company_id_idx").on(t.companyId),
  index("vehicle_logs_company_vehicle_date_idx").on(t.companyId, t.vehicleId, t.logDate),
  foreignKey({
    columns: [t.companyId, t.vehicleId],
    foreignColumns: [vehicles.companyId, vehicles.id],
    name: "vehicle_logs_company_vehicle_fk",
  }).onDelete("restrict"),
  check("vehicle_logs_values_valid", sql`mileage_km >= 0 AND (cost IS NULL OR cost >= 0)`),
]);

export const trips = mysqlTable("trips", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  vehicleId: int("vehicle_id").notNull(),
  driverContactId: int("driver_contact_id"),
  origin: varchar("origin", { length: 180 }),
  destination: varchar("destination", { length: 180 }),
  tripDate: datetime("trip_date").notNull(),
  fuelCost: decimal("fuel_cost", { precision: 18, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("ETB"),
  notes: text("notes"),
}, (t) => [index("trips_company_id_idx").on(t.companyId)]);

export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  contactId: int("contact_id"),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  jobTitle: varchar("job_title", { length: 100 }),
  startDate: datetime("start_date"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("employees_company_id_idx").on(t.companyId),
  index("employees_company_active_idx").on(t.companyId, t.isActive),
  index("employees_company_name_idx").on(t.companyId, t.fullName),
  uniqueIndex("employees_company_id_id_unique").on(t.companyId, t.id),
  foreignKey({
    columns: [t.companyId, t.contactId],
    foreignColumns: [contacts.companyId, contacts.id],
    name: "employees_company_contact_fk",
  }).onDelete("restrict"),
]);

export const salaryRecords = mysqlTable("salary_records", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  employeeId: int("employee_id").notNull().references(() => employees.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  periodLabel: varchar("period_label", { length: 40 }),
  paidAt: datetime("paid_at"),
  status: mysqlEnum("status", ["pending", "paid", "partial"]).notNull().default("pending"),
  notes: text("notes"),
}, (t) => [index("salary_records_company_id_idx").on(t.companyId)]);

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  storageKey: varchar("storage_key", { length: 500 }).notNull(),
  relatedType: varchar("related_type", { length: 60 }),
  relatedId: int("related_id"),
  uploadedBy: int("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("documents_company_id_idx").on(t.companyId)]);

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  userId: int("user_id"),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: varchar("entity_id", { length: 80 }),
  beforeData: json("before_data"),
  afterData: json("after_data"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("audit_logs_company_id_idx").on(t.companyId), index("audit_logs_company_created_idx").on(t.companyId, t.createdAt)]);

export const syncRecords = mysqlTable("sync_records", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  clientRecordId: varchar("client_record_id", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  serverRecordId: varchar("server_record_id", { length: 100 }),
  status: mysqlEnum("status", ["pending", "confirmed", "conflict"]).notNull().default("pending"),
  payload: json("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  syncedAt: datetime("synced_at"),
}, (t) => [index("sync_records_company_id_idx").on(t.companyId), uniqueIndex("sync_records_company_client_unique").on(t.companyId, t.clientRecordId)]);

export const syncConflicts = mysqlTable("sync_conflicts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  syncRecordId: int("sync_record_id").notNull(),
  localVersion: json("local_version"),
  serverVersion: json("server_version"),
  resolution: varchar("resolution", { length: 40 }),
  resolvedBy: int("resolved_by"),
  resolvedAt: datetime("resolved_at"),
}, (t) => [index("sync_conflicts_company_id_idx").on(t.companyId)]);

// Authorization model: permissions are assigned to roles, then inherited by users through roleId.
export const permissions = mysqlTable("permissions", { id: int("id").autoincrement().primaryKey(), code: varchar("code", { length: 100 }).notNull().unique(), description: varchar("description", { length: 255 }) });
export const rolePermissions = mysqlTable("role_permissions", { id: int("id").autoincrement().primaryKey(), roleId: int("role_id").notNull(), permissionId: int("permission_id").notNull() }, (t) => [uniqueIndex("role_permission_unique").on(t.roleId, t.permissionId)]);

// Ledger foundations. Posting services must create balanced journal lines in a single DB transaction.
export const journalAccounts = mysqlTable("journal_accounts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  accountClass: mysqlEnum("account_class", ["asset", "liability", "equity", "income", "expense"]).notNull(),
  currency: varchar("currency", { length: 3 }),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [index("journal_accounts_company_id_idx").on(t.companyId), uniqueIndex("journal_accounts_company_code_unique").on(t.companyId, t.code)]);

export const journalEntries = mysqlTable("journal_entries", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  entryNumber: varchar("entry_number", { length: 80 }).notNull(),
  entryDate: datetime("entry_date").notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  sourceType: varchar("source_type", { length: 60 }),
  sourceId: int("source_id"),
  status: mysqlEnum("status", ["draft", "posted", "reversed"]).notNull().default("draft"),
  createdBy: int("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("journal_entries_company_id_idx").on(t.companyId), uniqueIndex("journal_entries_company_number_unique").on(t.companyId, t.entryNumber)]);

export const journalLines = mysqlTable("journal_lines", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  journalEntryId: int("journal_entry_id").notNull(),
  journalAccountId: int("journal_account_id").notNull(),
  debit: decimal("debit", { precision: 18, scale: 2 }).notNull().default("0.00"),
  credit: decimal("credit", { precision: 18, scale: 2 }).notNull().default("0.00"),
  currency: varchar("currency", { length: 3 }).notNull(),
  contactId: int("contact_id"),
  memo: varchar("memo", { length: 255 }),
}, (t) => [index("journal_lines_company_id_idx").on(t.companyId)]);

export const accountMovements = mysqlTable("account_movements", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  financialAccountId: int("financial_account_id").notNull(),
  movementType: mysqlEnum("movement_type", ["opening", "deposit", "withdrawal", "transfer_in", "transfer_out", "payment", "adjustment"]).notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  relatedAccountId: int("related_account_id"),
  referenceType: varchar("reference_type", { length: 60 }),
  referenceId: int("reference_id"),
  occurredAt: datetime("occurred_at").notNull(),
  notes: text("notes"),
}, (t) => [index("account_movements_company_id_idx").on(t.companyId)]);

export const vehicleExpenses = mysqlTable("vehicle_expenses", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  vehicleId: int("vehicle_id").notNull(),
  expenseType: varchar("expense_type", { length: 80 }).notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  expenseDate: datetime("expense_date").notNull(),
  notes: text("notes"),
}, (t) => [index("vehicle_expenses_company_id_idx").on(t.companyId)]);

export const contactTypes = mysqlTable("contact_types", { id: int("id").autoincrement().primaryKey(), code: varchar("code", { length: 40 }).notNull().unique(), label: varchar("label", { length: 80 }).notNull(), isActive: boolean("is_active").notNull().default(true) });

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  publicId: varchar("public_id", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 180 }).notNull(),
  kind: mysqlEnum("kind", ["income", "expense", "receivable", "payable", "loan_given", "loan_received"]).notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("ETB"),
  exchangeRateSnapshot: decimal("exchange_rate_snapshot", { precision: 20, scale: 8 }),
  transactionDate: datetime("transaction_date").notNull(),
  enteredAt: timestamp("entered_at").defaultNow().notNull(),
  contactId: int("contact_id"),
  category: varchar("category", { length: 80 }),
  paymentMethod: mysqlEnum("payment_method", ["cash", "bank_transfer", "other"]),
  reference: varchar("reference", { length: 120 }),
  coffeeTradeId: int("coffee_trade_id").references(() => coffeeTrades.id, { onDelete: "set null" }),
  processingBatchId: int("processing_batch_id").references(() => processingBatches.id, { onDelete: "set null" }),
  inventoryItemId: int("inventory_item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
  vehicleLogId: int("vehicle_log_id").references(() => vehicleLogs.id, { onDelete: "set null" }),
  employeeId: int("employee_id").references(() => employees.id, { onDelete: "set null" }),
  notes: text("notes"),
  syncStatus: mysqlEnum("sync_status", ["confirmed", "pending", "conflict"]).notNull().default("confirmed"),
  createdBy: int("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("transactions_date_idx").on(t.transactionDate),
  index("transactions_kind_idx").on(t.kind),
  index("transactions_company_id_idx").on(t.companyId),
  index("transactions_company_date_idx").on(t.companyId, t.transactionDate),
  index("transactions_company_kind_idx").on(t.companyId, t.kind),
  uniqueIndex("transactions_company_id_id_unique").on(t.companyId, t.id),
]);

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  invoiceNumber: varchar("invoice_number", { length: 60 }).notNull(),
  partyType: mysqlEnum("party_type", ["customer", "supplier"]).notNull(),
  contactId: int("contact_id").notNull(),
  issueDate: datetime("issue_date").notNull(),
  dueDate: datetime("due_date").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "partially_paid", "paid", "cancelled"]).notNull().default("draft"),
  currency: varchar("currency", { length: 3 }).notNull().default("ETB"),
  subtotal: decimal("subtotal", { precision: 18, scale: 2 }).notNull().default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 18, scale: 2 }).notNull().default("0.00"),
  totalAmount: decimal("total_amount", { precision: 18, scale: 2 }).notNull().default("0.00"),
  amountPaid: decimal("amount_paid", { precision: 18, scale: 2 }).notNull().default("0.00"),
  notes: text("notes"),
  createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("invoices_company_number_unique").on(t.companyId, t.invoiceNumber),
  index("invoices_company_id_idx").on(t.companyId),
  index("invoices_company_status_due_idx").on(t.companyId, t.status, t.dueDate),
  index("invoices_company_contact_idx").on(t.companyId, t.contactId),
  uniqueIndex("invoices_company_id_id_unique").on(t.companyId, t.id),
  foreignKey({
    columns: [t.companyId, t.contactId],
    foreignColumns: [contacts.companyId, contacts.id],
    name: "invoices_company_contact_fk",
  }).onDelete("restrict"),
  check("invoices_amounts_valid", sql`subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND total_amount = subtotal + tax_amount AND amount_paid >= 0 AND amount_paid <= total_amount`),
]);

export const invoicePayments = mysqlTable("invoice_payments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull().references(() => companies.id),
  invoiceId: int("invoice_id").notNull(),
  transactionId: int("transaction_id").notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  paidAt: datetime("paid_at").notNull(),
  notes: text("notes"),
  createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("invoice_payments_company_id_idx").on(t.companyId),
  index("invoice_payments_company_invoice_idx").on(t.companyId, t.invoiceId),
  uniqueIndex("invoice_payments_company_transaction_unique").on(t.companyId, t.transactionId),
  foreignKey({
    columns: [t.companyId, t.invoiceId],
    foreignColumns: [invoices.companyId, invoices.id],
    name: "invoice_payments_company_invoice_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.companyId, t.transactionId],
    foreignColumns: [transactions.companyId, transactions.id],
    name: "invoice_payments_company_transaction_fk",
  }).onDelete("restrict"),
  check("invoice_payments_amount_positive", sql`amount > 0`),
]);

export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: datetime("expires_at").notNull(),
  usedAt: datetime("used_at"),
  requestIp: varchar("request_ip", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("password_reset_tokens_user_expiry_idx").on(t.userId, t.expiresAt)]);
