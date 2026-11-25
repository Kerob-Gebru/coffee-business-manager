import { z } from "zod";

const money = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter a valid amount with up to 2 decimals");

const positiveMoney = money.refine((v) => Number(v) > 0, "Amount must be greater than zero");

const weight = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "Enter a valid weight with up to 3 decimals");

const positiveWeight = weight.refine((v) => Number(v) > 0, "Weight must be greater than zero");

const dateString = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date");

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const password = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Password must contain letters and numbers");

const email = z.string().trim().email("Invalid email address").max(190);

// ---------- Contacts ----------

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(160),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email address").max(190).optional().or(z.literal("")),
  address: z.string().trim().max(1000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  roles: z.array(z.enum(["customer", "supplier", "exporter", "employee", "driver", "other"])).min(1, "Choose at least one contact role"),
});

export const updateContactSchema = contactSchema.partial().extend({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(160).optional(),
});

// ---------- Authentication ----------

export const registerSchema = z.object({
  companyName: z.string().trim().min(2, "Company name must be at least 2 characters").max(180),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(160),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: password,
});

export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().trim().regex(/^[a-f0-9]{64}$/, "Invalid reset token"),
  newPassword: password,
});

export const companyUpdateSchema = z.object({
  name: z.string().trim().min(2, "Company name must be at least 2 characters").max(180),
});

// ---------- Finance ----------

export const transactionSchema = z.object({
  title: z.string().trim().min(2).max(180),
  kind: z.enum(["income", "expense", "receivable", "payable", "loan_given", "loan_received"]),
  amount: positiveMoney,
  currency: z.string().trim().length(3).default("ETB"),
  transactionDate: dateString,
  notes: optionalText(2000),
  contactId: z.coerce.number().int().positive().optional().nullable(),
  category: optionalText(80),
  paymentMethod: z.enum(["cash", "bank_transfer", "other"]).optional().nullable(),
  reference: optionalText(120),
  coffeeTradeId: z.coerce.number().int().positive().optional().nullable(),
  processingBatchId: z.coerce.number().int().positive().optional().nullable(),
  inventoryItemId: z.coerce.number().int().positive().optional().nullable(),
  vehicleLogId: z.coerce.number().int().positive().optional().nullable(),
  employeeId: z.coerce.number().int().positive().optional().nullable(),
});

const invoiceEditable = {
  partyType: z.enum(["customer", "supplier"]),
  contactId: z.coerce.number().int().positive(),
  issueDate: dateString,
  dueDate: dateString,
  currency: z.string().trim().length(3).default("ETB"),
  subtotal: money,
  taxAmount: money.default("0"),
  notes: optionalText(2000),
};

export const invoiceCreateSchema = z
  .object({
    invoiceNumber: z
      .string()
      .trim()
      .min(1, "Invoice number is required")
      .max(60)
      .regex(/^[A-Za-z0-9][A-Za-z0-9\-/_.]*$/, "Invoice number may contain letters, numbers, dashes, slashes, dots and underscores"),
    ...invoiceEditable,
  })
  .refine((v) => Date.parse(v.dueDate) >= Date.parse(v.issueDate), {
    message: "Due date cannot be before the issue date",
    path: ["dueDate"],
  });

export const invoiceUpdateSchema = z
  .object({
    partyType: invoiceEditable.partyType.optional(),
    contactId: invoiceEditable.contactId.optional(),
    issueDate: invoiceEditable.issueDate.optional(),
    dueDate: invoiceEditable.dueDate.optional(),
    currency: invoiceEditable.currency.optional(),
    subtotal: invoiceEditable.subtotal.optional(),
    taxAmount: invoiceEditable.taxAmount.optional(),
    notes: invoiceEditable.notes,
    status: z.enum(["draft", "sent"]).optional(),
  })
  .refine((v) => !v.issueDate || !v.dueDate || Date.parse(v.dueDate) >= Date.parse(v.issueDate), {
    message: "Due date cannot be before the issue date",
    path: ["dueDate"],
  });

export const invoicePaymentSchema = z.object({
  amount: positiveMoney,
  paidAt: dateString,
  paymentMethod: z.enum(["cash", "bank_transfer", "other"]).default("cash"),
  reference: optionalText(120),
  notes: optionalText(2000),
});

// ---------- Operational modules ----------

export const coffeeTradeSchema = z.object({
  lotNumber: z.string().trim().min(1, "Lot number is required").max(80),
  grade: z.string().trim().min(1, "Grade is required").max(60),
  weightKg: positiveWeight,
  moisturePct: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter moisture as a percentage")
    .refine((v) => Number(v) >= 0 && Number(v) <= 100, "Moisture must be between 0 and 100"),
  contactId: z.coerce.number().int().positive(),
  tradeType: z.enum(["purchase", "sale"]),
  tradeDate: dateString,
  notes: optionalText(2000),
});

export const processingBatchSchema = z.object({
  batchCode: z.string().trim().min(1, "Batch code is required").max(80),
  machineId: z.coerce.number().int().positive().optional().nullable(),
  operatorContactId: z.coerce.number().int().positive().optional().nullable(),
  inputProductId: z.coerce.number().int().positive().optional().nullable(),
  inputQuantity: positiveWeight,
  outputQuantity: weight.optional().nullable(),
  processingMethod: z.enum(["washed", "natural", "other"]).optional().nullable(),
  startedAt: dateString,
  wasteQuantity: weight.optional().nullable(),
  notes: optionalText(2000),
});

export const processingCompleteSchema = z.object({
  outputQuantity: weight,
  wasteQuantity: weight.optional().nullable(),
  processingMethod: z.enum(["washed", "natural", "other"]).optional().nullable(),
  completedAt: dateString.optional(),
});

export const inventoryItemSchema = z.object({
  itemName: z.string().trim().min(2, "Item name must be at least 2 characters").max(160),
  warehouseLocation: z.string().trim().min(1, "Warehouse location is required").max(160),
  bagCount: z.coerce.number().int().min(0).default(0),
  totalWeightKg: weight.default("0"),
});

export const stockMovementSchema = z.object({
  direction: z.enum(["in", "out"]),
  bagQuantity: z.coerce.number().int().min(0).default(0),
  weightKg: positiveWeight,
  movementDate: dateString,
  reference: optionalText(255),
  notes: optionalText(2000),
});

export const vehicleSchema = z.object({
  name: optionalText(100),
  registrationNumber: z.string().trim().min(1, "Registration / plate number is required").max(60),
  vehicleType: optionalText(60),
  driverContactId: z.coerce.number().int().positive().optional().nullable(),
  driverName: optionalText(160),
  cargoItem: optionalText(160),
  cargoOwner: optionalText(160),
  cargoQuantity: optionalText(80),
  grossAmount: money.default("0"),
  costTaken: money.default("0"),
  currency: z.string().trim().length(3).default("ETB"),
  currentMileage: weight.default("0"),
  status: z.enum(["active", "maintenance", "inactive"]).default("active"),
  notes: optionalText(2000),
});

export const vehicleLogSchema = z.object({
  logType: z.enum(["maintenance", "fuel"]),
  description: z.string().trim().min(2, "Description is required").max(255),
  mileageKm: weight,
  logDate: dateString,
  cost: money.optional().nullable(),
  currency: z.string().trim().length(3).default("ETB"),
  notes: optionalText(2000),
});

export const employeeSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(160),
  phone: optionalText(40),
  jobTitle: optionalText(100),
  startDate: dateString.optional().nullable(),
  contactId: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
});
