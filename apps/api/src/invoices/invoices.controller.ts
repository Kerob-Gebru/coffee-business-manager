import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { and, asc, desc, eq, like, lt, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../database/client";
import {
  auditLogs,
  contacts,
  invoicePayments,
  invoices,
  transactions,
} from "../database/schema";
import {
  invoiceCreateSchema,
  invoicePaymentSchema,
  invoiceUpdateSchema,
} from "@coffee/validation";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import { belongsToCompany } from "../common/tenant";
import type { SessionUser } from "../common/session-user";

function parseId(value: string): number {
  const id = Number(value);
  if (!id || isNaN(id)) throw new BadRequestException("Invalid invoice ID");
  return id;
}

function toCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function invoiceStatusFor(totalCents: number, paidCents: number): "partially_paid" | "paid" {
  return paidCents >= totalCents ? "paid" : "partially_paid";
}

@Controller("invoices")
export class InvoicesController {
  private scope(companyId: number, id: number) {
    return and(eq(invoices.companyId, companyId), eq(invoices.id, id));
  }

  private async findOwned(companyId: number, id: number) {
    const rows = await db.select().from(invoices).where(this.scope(companyId, id)).limit(1);
    if (!rows.length) throw new NotFoundException(`Invoice #${id} not found`);
    return rows[0];
  }

  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query("status") status = "",
    @Query("partyType") partyType = "",
    @Query("q") q = "",
    @Query("overdue") overdue = "",
  ) {
    assertCan(user, "invoices.view");

    const conditions: SQL<unknown>[] = [eq(invoices.companyId, user.companyId)];
    if (["draft", "sent", "partially_paid", "paid", "cancelled"].includes(status)) {
      conditions.push(eq(invoices.status, status as any));
    }
    if (partyType === "customer" || partyType === "supplier") {
      conditions.push(eq(invoices.partyType, partyType));
    }
    if (q.trim()) {
      conditions.push(
        or(
          like(invoices.invoiceNumber, `%${q.trim()}%`),
          like(contacts.name, `%${q.trim()}%`),
        )!,
      );
    }
    if (overdue === "true") {
      conditions.push(lt(invoices.dueDate, new Date()));
      conditions.push(or(eq(invoices.status, "sent"), eq(invoices.status, "partially_paid"))!);
    }

    return db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        partyType: invoices.partyType,
        contactId: invoices.contactId,
        contactName: contacts.name,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        status: invoices.status,
        currency: invoices.currency,
        subtotal: invoices.subtotal,
        taxAmount: invoices.taxAmount,
        totalAmount: invoices.totalAmount,
        amountPaid: invoices.amountPaid,
        outstandingBalance: sql<string>`(${invoices.totalAmount} - ${invoices.amountPaid})`,
        notes: invoices.notes,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .leftJoin(
        contacts,
        and(eq(contacts.companyId, invoices.companyId), eq(contacts.id, invoices.contactId)),
      )
      .where(and(...conditions))
      .orderBy(asc(invoices.dueDate), desc(invoices.issueDate), desc(invoices.id))
      .limit(300);
  }

  @Get(":id")
  async getOne(@CurrentUser() user: SessionUser, @Param("id") idParam: string) {
    assertCan(user, "invoices.view");
    const id = parseId(idParam);
    const invoice = await this.findOwned(user.companyId, id);

    const contact = await db
      .select({ id: contacts.id, name: contacts.name, email: contacts.email, phone: contacts.phone })
      .from(contacts)
      .where(and(eq(contacts.companyId, user.companyId), eq(contacts.id, invoice.contactId)))
      .limit(1);

    const payments = await db
      .select({
        id: invoicePayments.id,
        amount: invoicePayments.amount,
        paidAt: invoicePayments.paidAt,
        notes: invoicePayments.notes,
        transactionId: invoicePayments.transactionId,
        createdAt: invoicePayments.createdAt,
        paymentMethod: transactions.paymentMethod,
        reference: transactions.reference,
      })
      .from(invoicePayments)
      .leftJoin(
        transactions,
        and(
          eq(transactions.companyId, invoicePayments.companyId),
          eq(transactions.id, invoicePayments.transactionId),
        ),
      )
      .where(and(eq(invoicePayments.companyId, user.companyId), eq(invoicePayments.invoiceId, id)))
      .orderBy(asc(invoicePayments.paidAt), asc(invoicePayments.id));

    return {
      ...invoice,
      contact: contact[0] ?? null,
      outstandingBalance: fromCents(toCents(invoice.totalAmount) - toCents(invoice.amountPaid)),
      payments,
    };
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    assertCan(user, "invoices.create");

    const parsed = invoiceCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    if (!(await belongsToCompany(contacts, input.contactId, user.companyId))) {
      throw new BadRequestException("Selected contact does not belong to this workspace");
    }

    const duplicate = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, user.companyId),
          eq(invoices.invoiceNumber, input.invoiceNumber),
        ),
      )
      .limit(1);
    if (duplicate.length) {
      throw new ConflictException("An invoice with this number already exists in this workspace");
    }

    const subtotalCents = toCents(input.subtotal);
    const taxCents = toCents(input.taxAmount);
    const totalCents = subtotalCents + taxCents;

    const id = await db.transaction(async (tx) => {
      const result = await tx.insert(invoices).values({
        companyId: user.companyId,
        invoiceNumber: input.invoiceNumber,
        partyType: input.partyType,
        contactId: input.contactId,
        issueDate: new Date(input.issueDate),
        dueDate: new Date(input.dueDate),
        status: "draft",
        currency: input.currency.toUpperCase(),
        subtotal: fromCents(subtotalCents),
        taxAmount: fromCents(taxCents),
        totalAmount: fromCents(totalCents),
        amountPaid: "0.00",
        notes: input.notes || null,
        createdBy: user.id,
      });
      const invoiceId = Number(result[0].insertId);

      await tx.insert(auditLogs).values({
        companyId: user.companyId,
        userId: user.id,
        action: "invoice.created",
        entityType: "invoice",
        entityId: String(invoiceId),
        afterData: {
          invoiceNumber: input.invoiceNumber,
          partyType: input.partyType,
          contactId: input.contactId,
          totalAmount: fromCents(totalCents),
        } as any,
        reason: "Invoice recorded; no financial transaction created",
      });

      return invoiceId;
    });

    // Creating an invoice never creates a finance transaction. Only recorded
    // payments post to the transaction ledger.
    return {
      id,
      invoiceNumber: input.invoiceNumber,
      totalAmount: fromCents(totalCents),
      outstandingBalance: fromCents(totalCents),
      message: "Invoice created",
    };
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: SessionUser,
    @Param("id") idParam: string,
    @Body() body: unknown,
  ) {
    assertCan(user, "invoices.edit");
    const id = parseId(idParam);

    const parsed = invoiceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;
    const existing = await this.findOwned(user.companyId, id);

    if (existing.status === "cancelled" || existing.status === "paid") {
      throw new BadRequestException(`A ${existing.status} invoice cannot be edited`);
    }
    if (input.status && toCents(existing.amountPaid) > 0) {
      throw new BadRequestException("Status can only be changed manually before any payment is recorded");
    }
    if (input.contactId && !(await belongsToCompany(contacts, input.contactId, user.companyId))) {
      throw new BadRequestException("Selected contact does not belong to this workspace");
    }

    const subtotalCents = input.subtotal !== undefined ? toCents(input.subtotal) : toCents(existing.subtotal);
    const taxCents = input.taxAmount !== undefined ? toCents(input.taxAmount) : toCents(existing.taxAmount);
    const totalCents = subtotalCents + taxCents;
    const paidCents = toCents(existing.amountPaid);
    if (paidCents > totalCents) {
      throw new BadRequestException("Invoice total cannot be lower than the amount already paid");
    }

    const payload: Record<string, unknown> = {
      subtotal: fromCents(subtotalCents),
      taxAmount: fromCents(taxCents),
      totalAmount: fromCents(totalCents),
      updatedAt: new Date(),
    };
    if (input.partyType !== undefined) payload.partyType = input.partyType;
    if (input.contactId !== undefined) payload.contactId = input.contactId;
    if (input.issueDate !== undefined) payload.issueDate = new Date(input.issueDate);
    if (input.dueDate !== undefined) payload.dueDate = new Date(input.dueDate);
    if (input.currency !== undefined) payload.currency = input.currency.toUpperCase();
    if (input.notes !== undefined) payload.notes = input.notes || null;
    if (input.status !== undefined) payload.status = input.status;

    await db.transaction(async (tx) => {
      await tx.update(invoices).set(payload as any).where(this.scope(user.companyId, id));

      await tx.insert(auditLogs).values({
        companyId: user.companyId,
        userId: user.id,
        action: "invoice.updated",
        entityType: "invoice",
        entityId: String(id),
        beforeData: existing as any,
        afterData: payload as any,
      });
    });

    return { id, totalAmount: fromCents(totalCents), message: "Invoice updated" };
  }

  @Post(":id/cancel")
  async cancel(@CurrentUser() user: SessionUser, @Param("id") idParam: string) {
    assertCan(user, "invoices.cancel");
    const id = parseId(idParam);
    const existing = await this.findOwned(user.companyId, id);

    if (existing.status === "cancelled") {
      return { id, message: "Invoice is already cancelled" };
    }
    if (toCents(existing.amountPaid) > 0) {
      throw new BadRequestException("An invoice with recorded payments cannot be cancelled");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(this.scope(user.companyId, id));

      await tx.insert(auditLogs).values({
        companyId: user.companyId,
        userId: user.id,
        action: "invoice.cancelled",
        entityType: "invoice",
        entityId: String(id),
        beforeData: { status: existing.status } as any,
        afterData: { status: "cancelled" } as any,
      });
    });

    return { id, message: "Invoice cancelled" };
  }

  @Post(":id/payments")
  async recordPayment(
    @CurrentUser() user: SessionUser,
    @Param("id") idParam: string,
    @Body() body: unknown,
  ) {
    assertCan(user, "invoices.payment");
    const id = parseId(idParam);

    const parsed = invoicePaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;
    const amountCents = toCents(input.amount);

    const outcome = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(invoices)
        .where(this.scope(user.companyId, id))
        .limit(1)
        .for("update");
      const invoice = rows[0];
      if (!invoice) throw new NotFoundException(`Invoice #${id} not found`);
      if (invoice.status === "cancelled") {
        throw new BadRequestException("Payments cannot be recorded against a cancelled invoice");
      }
      if (invoice.status === "paid") {
        throw new BadRequestException("This invoice is already fully paid");
      }

      const totalCents = toCents(invoice.totalAmount);
      const paidCents = toCents(invoice.amountPaid);
      const outstandingCents = totalCents - paidCents;
      if (amountCents > outstandingCents) {
        throw new BadRequestException(
          `Payment exceeds the outstanding balance of ${fromCents(outstandingCents)}`,
        );
      }

      const transactionResult = await tx.insert(transactions).values({
        companyId: user.companyId,
        publicId: randomUUID(),
        title: `Payment for invoice ${invoice.invoiceNumber}`,
        kind: invoice.partyType === "customer" ? "income" : "expense",
        amount: fromCents(amountCents),
        currency: invoice.currency,
        transactionDate: new Date(input.paidAt),
        contactId: invoice.contactId,
        category: "invoice_payment",
        paymentMethod: input.paymentMethod,
        reference: input.reference || invoice.invoiceNumber,
        notes: input.notes || null,
        createdBy: user.id,
        syncStatus: "confirmed",
      });
      const transactionId = Number(transactionResult[0].insertId);

      await tx.insert(invoicePayments).values({
        companyId: user.companyId,
        invoiceId: id,
        transactionId,
        amount: fromCents(amountCents),
        paidAt: new Date(input.paidAt),
        notes: input.notes || null,
        createdBy: user.id,
      });

      const nextPaidCents = paidCents + amountCents;
      const nextStatus = invoiceStatusFor(totalCents, nextPaidCents);
      await tx
        .update(invoices)
        .set({
          amountPaid: fromCents(nextPaidCents),
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(this.scope(user.companyId, id));

      await tx.insert(auditLogs).values({
        companyId: user.companyId,
        userId: user.id,
        action: "invoice.payment_recorded",
        entityType: "invoice",
        entityId: String(id),
        afterData: {
          amount: fromCents(amountCents),
          transactionId,
          status: nextStatus,
        } as any,
      });

      return {
        transactionId,
        amountPaid: fromCents(nextPaidCents),
        outstandingBalance: fromCents(totalCents - nextPaidCents),
        status: nextStatus,
      };
    });

    return { id, ...outcome, message: "Payment recorded" };
  }
}
