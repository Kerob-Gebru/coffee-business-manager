export interface VehicleMoneyLike {
  grossAmount?: string | number | null;
  costTaken?: string | number | null;
  currency?: string | null;
}

export interface VehicleCurrencySummary {
  currency: string;
  grossTotal: string;
  costTotal: string;
  netTotal: string;
  count: number;
}

export function parseMoneyValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCents(value: string | number | null | undefined): number {
  return Math.round(parseMoneyValue(value) * 100);
}

function fromCents(cents: number): string {
  const normalized = cents === 0 ? 0 : cents;
  return (normalized / 100).toFixed(2);
}

export function calculateVehicleNet(
  grossAmount: string | number | null | undefined,
  costTaken: string | number | null | undefined,
): string {
  const netCents = toCents(grossAmount) - toCents(costTaken);
  return fromCents(netCents);
}

export function deriveVehicleName(params: {
  name?: string | null;
  driverName?: string | null;
  registrationNumber: string;
}): string {
  const explicit = params.name?.trim();
  if (explicit && explicit.length >= 2) return explicit.slice(0, 100);
  const driver = params.driverName?.trim();
  const plate = params.registrationNumber.trim();
  if (driver && plate) return `${driver} (${plate})`.slice(0, 100);
  if (driver && driver.length >= 2) return driver.slice(0, 100);
  return plate.length >= 2 ? plate.slice(0, 100) : `Vehicle ${plate}`.slice(0, 100);
}

export function summarizeVehiclesByCurrency(
  rows: VehicleMoneyLike[],
): VehicleCurrencySummary[] {
  const groups = new Map<
    string,
    { grossCents: number; costCents: number; count: number }
  >();

  for (const row of rows) {
    const currency = (row.currency || "ETB").trim().toUpperCase() || "ETB";
    const entry = groups.get(currency) ?? {
      grossCents: 0,
      costCents: 0,
      count: 0,
    };
    entry.grossCents += toCents(row.grossAmount);
    entry.costCents += toCents(row.costTaken);
    entry.count += 1;
    groups.set(currency, entry);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === "ETB") return -1;
      if (b === "ETB") return 1;
      return a.localeCompare(b);
    })
    .map(([currency, entry]) => ({
      currency,
      grossTotal: fromCents(entry.grossCents),
      costTotal: fromCents(entry.costCents),
      netTotal: fromCents(entry.grossCents - entry.costCents),
      count: entry.count,
    }));
}
