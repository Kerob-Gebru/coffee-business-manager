export type Contact = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  roles: string[] | string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Tx = {
  id: number;
  title: string;
  kind: string;
  amount: string;
  currency: string;
  transactionDate: string;
};

export type SessionUser = {
  id: number;
  companyId: number;
  fullName: string;
  email: string;
  role: string;
};

export type Company = {
  id: number;
  name: string;
  status: string;
};

export type Invoice = {
  id: number;
  invoiceNumber: string;
  partyType: "customer" | "supplier";
  contactId: number;
  contactName: string | null;
  issueDate: string;
  dueDate: string;
  status: "draft" | "sent" | "partially_paid" | "paid" | "cancelled";
  currency: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  outstandingBalance: string;
  notes: string | null;
  createdAt: string;
};

export type InvoicePayment = {
  id: number;
  amount: string;
  paidAt: string;
  notes: string | null;
  transactionId: number;
  createdAt: string;
  paymentMethod: string | null;
  reference: string | null;
};

export type InvoiceDetail = Invoice & {
  contact: { id: number; name: string; email: string | null; phone: string | null } | null;
  payments: InvoicePayment[];
};

export type CoffeeTrade = {
  id: number;
  lotNumber: string;
  grade: string;
  weightKg: string;
  moisturePct: string | null;
  contactId: number;
  contactName: string | null;
  tradeType: "purchase" | "sale";
  tradeDate: string;
  notes: string | null;
  createdAt: string;
};

export type ProcessingBatch = {
  id: number;
  batchCode: string;
  machineName: string | null;
  operatorName: string | null;
  inputQuantity: string;
  outputQuantity: string | null;
  wasteQuantity: string | null;
  processingMethod: string | null;
  startedAt: string;
  completedAt: string | null;
  status: "planned" | "running" | "completed" | "cancelled";
  notes: string | null;
  createdAt: string;
};

export type InventoryItem = {
  id: number;
  itemName: string;
  warehouseLocation: string;
  bagCount: number;
  totalWeightKg: string;
  createdAt: string;
  updatedAt: string;
};

export type StockMovement = {
  id: number;
  inventoryItemId: number;
  direction: "in" | "out";
  bagQuantity: number;
  weightKg: string;
  movementDate: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
};

export type Vehicle = {
  id: number;
  name: string;
  registrationNumber: string;
  vehicleType: string | null;
  driverContactId: number | null;
  driverName: string | null;
  currentMileage: string;
  status: "active" | "maintenance" | "inactive";
  notes: string | null;
  createdAt: string;
};

export type VehicleLog = {
  id: number;
  vehicleId: number;
  logType: "maintenance" | "fuel";
  description: string;
  mileageKm: string;
  logDate: string;
  cost: string | null;
  currency: string;
  notes: string | null;
  createdAt: string;
};

export type Employee = {
  id: number;
  fullName: string;
  phone: string | null;
  jobTitle: string | null;
  startDate: string | null;
  isActive: boolean;
  contactId: number | null;
  contactName: string | null;
  createdAt: string;
};
