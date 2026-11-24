import { Controller, Get, Query } from "@nestjs/common";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "../database/client";
import {
  coffeeTrades,
  employees,
  inventoryItems,
  invoices,
  processingBatches,
  salaryRecords,
  stockMovements,
  transactions,
  vehicleLogs,
  vehicles,
} from "../database/schema";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import type { SessionUser } from "../common/session-user";

function dateRange(column: any, from: string, to: string): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];
  if (from && !Number.isNaN(Date.parse(from))) conditions.push(gte(column, new Date(from)));
  if (to && !Number.isNaN(Date.parse(to))) {
    const end = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setHours(23, 59, 59, 999);
    conditions.push(lte(column, end));
  }
  return conditions;
}

@Controller("reports")
export class ReportsController {
  @Get("finance")
  async finance(
    @CurrentUser() user: SessionUser,
    @Query("from") from = "",
    @Query("to") to = "",
  ) {
    assertCan(user, "reports.view");

    const conditions: SQL<unknown>[] = [
      eq(transactions.companyId, user.companyId),
      ...dateRange(transactions.transactionDate, from, to),
    ];

    const rows = await db
      .select({
        kind: transactions.kind,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
        entries: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(...conditions))
      .groupBy(transactions.kind);

    const byKind: Record<string, { total: number; entries: number }> = {};
    for (const row of rows) {
      byKind[row.kind] = { total: Number(row.total), entries: Number(row.entries) };
    }

    const invoiceConditions: SQL<unknown>[] = [
      eq(invoices.companyId, user.companyId),
      ...dateRange(invoices.issueDate, from, to),
    ];
    const invoiceRows = await db
      .select({
        partyType: invoices.partyType,
        status: invoices.status,
        total: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
        paid: sql<string>`COALESCE(SUM(${invoices.amountPaid}), 0)`,
      })
      .from(invoices)
      .where(and(...invoiceConditions))
      .groupBy(invoices.partyType, invoices.status);

    const income = byKind.income?.total ?? 0;
    const expense = byKind.expense?.total ?? 0;

    return {
      from: from || null,
      to: to || null,
      transactions: {
        income,
        expense,
        net: Number((income - expense).toFixed(2)),
        byKind,
      },
      invoices: invoiceRows.map((row) => ({
        partyType: row.partyType,
        status: row.status,
        total: Number(row.total),
        paid: Number(row.paid),
        outstanding: Number((Number(row.total) - Number(row.paid)).toFixed(2)),
      })),
    };
  }

  @Get("coffee-trades")
  async coffee(
    @CurrentUser() user: SessionUser,
    @Query("from") from = "",
    @Query("to") to = "",
  ) {
    assertCan(user, "reports.view");

    const conditions: SQL<unknown>[] = [
      eq(coffeeTrades.companyId, user.companyId),
      ...dateRange(coffeeTrades.tradeDate, from, to),
    ];

    const rows = await db
      .select({
        tradeType: coffeeTrades.tradeType,
        grade: coffeeTrades.grade,
        lots: sql<number>`COUNT(*)`,
        weightKg: sql<string>`COALESCE(SUM(${coffeeTrades.weightKg}), 0)`,
        avgMoisture: sql<string>`COALESCE(AVG(${coffeeTrades.moisturePct}), 0)`,
      })
      .from(coffeeTrades)
      .where(and(...conditions))
      .groupBy(coffeeTrades.tradeType, coffeeTrades.grade);

    return {
      from: from || null,
      to: to || null,
      rows: rows.map((row) => ({
        tradeType: row.tradeType,
        grade: row.grade,
        lots: Number(row.lots),
        weightKg: Number(row.weightKg),
        avgMoisture: Number(row.avgMoisture),
      })),
    };
  }

  @Get("processing")
  async processing(
    @CurrentUser() user: SessionUser,
    @Query("from") from = "",
    @Query("to") to = "",
  ) {
    assertCan(user, "reports.view");

    const conditions: SQL<unknown>[] = [
      eq(processingBatches.companyId, user.companyId),
      ...dateRange(processingBatches.startedAt, from, to),
    ];

    const rows = await db
      .select({
        status: processingBatches.status,
        batches: sql<number>`COUNT(*)`,
        inputQuantity: sql<string>`COALESCE(SUM(${processingBatches.inputQuantity}), 0)`,
        outputQuantity: sql<string>`COALESCE(SUM(${processingBatches.outputQuantity}), 0)`,
        wasteQuantity: sql<string>`COALESCE(SUM(${processingBatches.wasteQuantity}), 0)`,
      })
      .from(processingBatches)
      .where(and(...conditions))
      .groupBy(processingBatches.status);

    return {
      from: from || null,
      to: to || null,
      rows: rows.map((row) => ({
        status: row.status,
        batches: Number(row.batches),
        inputQuantity: Number(row.inputQuantity),
        outputQuantity: Number(row.outputQuantity),
        wasteQuantity: Number(row.wasteQuantity),
        yieldPct:
          Number(row.inputQuantity) > 0
            ? Number(((Number(row.outputQuantity) / Number(row.inputQuantity)) * 100).toFixed(2))
            : 0,
      })),
    };
  }

  @Get("inventory")
  async inventory(@CurrentUser() user: SessionUser) {
    assertCan(user, "reports.view");

    const items = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.companyId, user.companyId));

    const movementRows = await db
      .select({
        inventoryItemId: stockMovements.inventoryItemId,
        inBags: sql<string>`COALESCE(SUM(CASE WHEN ${stockMovements.direction} = 'in' THEN ${stockMovements.bagQuantity} ELSE 0 END), 0)`,
        outBags: sql<string>`COALESCE(SUM(CASE WHEN ${stockMovements.direction} = 'out' THEN ${stockMovements.bagQuantity} ELSE 0 END), 0)`,
        inWeight: sql<string>`COALESCE(SUM(CASE WHEN ${stockMovements.direction} = 'in' THEN ${stockMovements.weightKg} ELSE 0 END), 0)`,
        outWeight: sql<string>`COALESCE(SUM(CASE WHEN ${stockMovements.direction} = 'out' THEN ${stockMovements.weightKg} ELSE 0 END), 0)`,
      })
      .from(stockMovements)
      .where(eq(stockMovements.companyId, user.companyId))
      .groupBy(stockMovements.inventoryItemId);

    const movementsById = new Map(movementRows.map((row) => [row.inventoryItemId, row]));

    return {
      items: items.map((item) => {
        const movement = movementsById.get(item.id);
        return {
          id: item.id,
          itemName: item.itemName,
          warehouseLocation: item.warehouseLocation,
          bagCount: item.bagCount,
          totalWeightKg: Number(item.totalWeightKg),
          receivedBags: Number(movement?.inBags ?? 0),
          issuedBags: Number(movement?.outBags ?? 0),
          receivedWeightKg: Number(movement?.inWeight ?? 0),
          issuedWeightKg: Number(movement?.outWeight ?? 0),
        };
      }),
      totals: {
        items: items.length,
        bags: items.reduce((sum, item) => sum + item.bagCount, 0),
        weightKg: Number(items.reduce((sum, item) => sum + Number(item.totalWeightKg), 0).toFixed(3)),
      },
    };
  }

  @Get("vehicles")
  async vehicleReport(
    @CurrentUser() user: SessionUser,
    @Query("from") from = "",
    @Query("to") to = "",
  ) {
    assertCan(user, "reports.view");

    const list = await db
      .select({
        id: vehicles.id,
        name: vehicles.name,
        registrationNumber: vehicles.registrationNumber,
        status: vehicles.status,
        currentMileage: vehicles.currentMileage,
      })
      .from(vehicles)
      .where(eq(vehicles.companyId, user.companyId));

    const conditions: SQL<unknown>[] = [
      eq(vehicleLogs.companyId, user.companyId),
      ...dateRange(vehicleLogs.logDate, from, to),
    ];

    const logRows = await db
      .select({
        vehicleId: vehicleLogs.vehicleId,
        logs: sql<number>`COUNT(*)`,
        fuelCost: sql<string>`COALESCE(SUM(CASE WHEN ${vehicleLogs.logType} = 'fuel' THEN ${vehicleLogs.cost} ELSE 0 END), 0)`,
        maintenanceCost: sql<string>`COALESCE(SUM(CASE WHEN ${vehicleLogs.logType} = 'maintenance' THEN ${vehicleLogs.cost} ELSE 0 END), 0)`,
      })
      .from(vehicleLogs)
      .where(and(...conditions))
      .groupBy(vehicleLogs.vehicleId);

    const logsById = new Map(logRows.map((row) => [row.vehicleId, row]));

    return {
      from: from || null,
      to: to || null,
      vehicles: list.map((vehicle) => {
        const logs = logsById.get(vehicle.id);
        const fuelCost = Number(logs?.fuelCost ?? 0);
        const maintenanceCost = Number(logs?.maintenanceCost ?? 0);
        return {
          ...vehicle,
          currentMileage: Number(vehicle.currentMileage),
          logs: Number(logs?.logs ?? 0),
          fuelCost,
          maintenanceCost,
          totalCost: Number((fuelCost + maintenanceCost).toFixed(2)),
        };
      }),
    };
  }

  @Get("employees")
  async employeeReport(@CurrentUser() user: SessionUser) {
    assertCan(user, "reports.view");

    const list = await db
      .select({
        id: employees.id,
        fullName: employees.fullName,
        jobTitle: employees.jobTitle,
        isActive: employees.isActive,
      })
      .from(employees)
      .where(eq(employees.companyId, user.companyId));

    const salaryRows = await db
      .select({
        status: salaryRecords.status,
        records: sql<number>`COUNT(*)`,
        total: sql<string>`COALESCE(SUM(${salaryRecords.amount}), 0)`,
      })
      .from(salaryRecords)
      .where(eq(salaryRecords.companyId, user.companyId))
      .groupBy(salaryRecords.status);

    return {
      totalEmployees: list.length,
      activeEmployees: list.filter((employee) => employee.isActive).length,
      archivedEmployees: list.filter((employee) => !employee.isActive).length,
      employees: list,
      salaryByStatus: salaryRows.map((row) => ({
        status: row.status,
        records: Number(row.records),
        total: Number(row.total),
      })),
    };
  }
}
