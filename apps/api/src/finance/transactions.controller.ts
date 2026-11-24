import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";
import { and, desc, eq, gte, like, lte, type SQL } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../database/client";
import {
  coffeeTrades,
  contacts,
  employees,
  inventoryItems,
  processingBatches,
  transactions,
  vehicleLogs,
} from "../database/schema";
import { transactionSchema } from "@coffee/validation";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import { belongsToCompany, writeAudit } from "../common/tenant";
import type { SessionUser } from "../common/session-user";

const LINK_TABLES = {
  coffeeTradeId: [coffeeTrades, "coffee trade"],
  processingBatchId: [processingBatches, "processing batch"],
  inventoryItemId: [inventoryItems, "inventory item"],
  vehicleLogId: [vehicleLogs, "vehicle log"],
  employeeId: [employees, "employee"],
} as const;

@Controller("transactions")
export class TransactionsController {
  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query("kind") kind = "",
    @Query("from") from = "",
    @Query("to") to = "",
    @Query("q") q = "",
    @Query("contactId") contactIdParam = "",
    @Query("limit") limitParam = "200",
  ) {
    assertCan(user, "finance.view");

    const conditions: SQL<unknown>[] = [eq(transactions.companyId, user.companyId)];
    if (kind) conditions.push(eq(transactions.kind, kind as any));
    if (from && !Number.isNaN(Date.parse(from))) {
      conditions.push(gte(transactions.transactionDate, new Date(from)));
    }
    if (to && !Number.isNaN(Date.parse(to))) {
      const end = new Date(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setHours(23, 59, 59, 999);
      conditions.push(lte(transactions.transactionDate, end));
    }
    if (q.trim()) conditions.push(like(transactions.title, `%${q.trim()}%`));
    const contactId = Number(contactIdParam);
    if (contactId) conditions.push(eq(transactions.contactId, contactId));

    const limit = Math.min(Math.max(Number(limitParam) || 200, 1), 500);

    return db
      .select({
        id: transactions.id,
        publicId: transactions.publicId,
        title: transactions.title,
        kind: transactions.kind,
        amount: transactions.amount,
        currency: transactions.currency,
        transactionDate: transactions.transactionDate,
        contactId: transactions.contactId,
        contactName: contacts.name,
        category: transactions.category,
        paymentMethod: transactions.paymentMethod,
        reference: transactions.reference,
        notes: transactions.notes,
        coffeeTradeId: transactions.coffeeTradeId,
        processingBatchId: transactions.processingBatchId,
        inventoryItemId: transactions.inventoryItemId,
        vehicleLogId: transactions.vehicleLogId,
        employeeId: transactions.employeeId,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .leftJoin(
        contacts,
        and(eq(contacts.companyId, transactions.companyId), eq(contacts.id, transactions.contactId)),
      )
      .where(and(...conditions))
      .orderBy(desc(transactions.transactionDate), desc(transactions.id))
      .limit(limit);
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    assertCan(user, "finance.create");

    const parsed = transactionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    if (input.contactId) {
      const owned = await belongsToCompany(contacts, input.contactId, user.companyId);
      if (!owned) throw new BadRequestException("Selected contact does not belong to this workspace");
    }

    for (const key of Object.keys(LINK_TABLES) as (keyof typeof LINK_TABLES)[]) {
      const id = input[key];
      if (!id) continue;
      const [table, label] = LINK_TABLES[key];
      const owned = await belongsToCompany(table as any, id, user.companyId);
      if (!owned) {
        throw new BadRequestException(`Selected ${label} does not belong to this workspace`);
      }
    }

    const publicId = randomUUID();
    const result = await db.insert(transactions).values({
      companyId: user.companyId,
      publicId,
      title: input.title,
      kind: input.kind,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      transactionDate: new Date(input.transactionDate),
      contactId: input.contactId ?? null,
      category: input.category || null,
      paymentMethod: input.paymentMethod ?? null,
      reference: input.reference || null,
      coffeeTradeId: input.coffeeTradeId ?? null,
      processingBatchId: input.processingBatchId ?? null,
      inventoryItemId: input.inventoryItemId ?? null,
      vehicleLogId: input.vehicleLogId ?? null,
      employeeId: input.employeeId ?? null,
      notes: input.notes || null,
      createdBy: user.id,
      syncStatus: "confirmed",
    });
    const id = Number(result[0].insertId);

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "transaction.created",
      entityType: "transaction",
      entityId: id,
      afterData: { title: input.title, kind: input.kind, amount: input.amount },
    });

    return { id, publicId, message: "Record saved" };
  }
}
