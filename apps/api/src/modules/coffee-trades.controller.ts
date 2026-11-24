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
import { and, desc, eq, gte, like, lte, or, type SQL } from "drizzle-orm";
import { db } from "../database/client";
import { coffeeTrades, contacts } from "../database/schema";
import { coffeeTradeSchema } from "@coffee/validation";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import { belongsToCompany, writeAudit } from "../common/tenant";
import type { SessionUser } from "../common/session-user";

function parseId(value: string): number {
  const id = Number(value);
  if (!id || isNaN(id)) throw new BadRequestException("Invalid record ID");
  return id;
}

@Controller("coffee-trades")
export class CoffeeTradesController {
  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query("tradeType") tradeType = "",
    @Query("from") from = "",
    @Query("to") to = "",
    @Query("q") q = "",
  ) {
    assertCan(user, "modules.view");

    const conditions: SQL<unknown>[] = [eq(coffeeTrades.companyId, user.companyId)];
    if (tradeType === "purchase" || tradeType === "sale") {
      conditions.push(eq(coffeeTrades.tradeType, tradeType));
    }
    if (from && !Number.isNaN(Date.parse(from))) {
      conditions.push(gte(coffeeTrades.tradeDate, new Date(from)));
    }
    if (to && !Number.isNaN(Date.parse(to))) {
      const end = new Date(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setHours(23, 59, 59, 999);
      conditions.push(lte(coffeeTrades.tradeDate, end));
    }
    if (q.trim()) {
      conditions.push(or(like(coffeeTrades.lotNumber, `%${q.trim()}%`), like(coffeeTrades.grade, `%${q.trim()}%`))!);
    }

    return db
      .select({
        id: coffeeTrades.id,
        lotNumber: coffeeTrades.lotNumber,
        grade: coffeeTrades.grade,
        weightKg: coffeeTrades.weightKg,
        moisturePct: coffeeTrades.moisturePct,
        contactId: coffeeTrades.contactId,
        contactName: contacts.name,
        tradeType: coffeeTrades.tradeType,
        tradeDate: coffeeTrades.tradeDate,
        notes: coffeeTrades.notes,
        createdAt: coffeeTrades.createdAt,
      })
      .from(coffeeTrades)
      .leftJoin(
        contacts,
        and(eq(contacts.companyId, coffeeTrades.companyId), eq(contacts.id, coffeeTrades.contactId)),
      )
      .where(and(...conditions))
      .orderBy(desc(coffeeTrades.tradeDate), desc(coffeeTrades.id))
      .limit(200);
  }

  @Get(":id")
  async getOne(@CurrentUser() user: SessionUser, @Param("id") idParam: string) {
    assertCan(user, "modules.view");
    const id = parseId(idParam);
    const rows = await db
      .select()
      .from(coffeeTrades)
      .where(and(eq(coffeeTrades.companyId, user.companyId), eq(coffeeTrades.id, id)))
      .limit(1);
    if (!rows.length) throw new NotFoundException(`Coffee trade #${id} not found`);
    return rows[0];
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    assertCan(user, "modules.manage");

    const parsed = coffeeTradeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    if (!(await belongsToCompany(contacts, input.contactId, user.companyId))) {
      throw new BadRequestException("Selected contact does not belong to this workspace");
    }

    const duplicate = await db
      .select({ id: coffeeTrades.id })
      .from(coffeeTrades)
      .where(and(eq(coffeeTrades.companyId, user.companyId), eq(coffeeTrades.lotNumber, input.lotNumber)))
      .limit(1);
    if (duplicate.length) {
      throw new ConflictException("A coffee trade with this lot number already exists");
    }

    const result = await db.insert(coffeeTrades).values({
      companyId: user.companyId,
      lotNumber: input.lotNumber,
      grade: input.grade,
      weightKg: input.weightKg,
      moisturePct: input.moisturePct,
      contactId: input.contactId,
      tradeType: input.tradeType,
      tradeDate: new Date(input.tradeDate),
      notes: input.notes || null,
      createdBy: user.id,
    });
    const id = Number(result[0].insertId);

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "coffee_trade.created",
      entityType: "coffee_trade",
      entityId: id,
      afterData: input,
    });

    return { id, message: "Coffee trade recorded" };
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: SessionUser,
    @Param("id") idParam: string,
    @Body() body: unknown,
  ) {
    assertCan(user, "modules.manage");
    const id = parseId(idParam);

    const parsed = coffeeTradeSchema.partial().safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    const existing = await db
      .select()
      .from(coffeeTrades)
      .where(and(eq(coffeeTrades.companyId, user.companyId), eq(coffeeTrades.id, id)))
      .limit(1);
    if (!existing.length) throw new NotFoundException(`Coffee trade #${id} not found`);

    if (input.contactId && !(await belongsToCompany(contacts, input.contactId, user.companyId))) {
      throw new BadRequestException("Selected contact does not belong to this workspace");
    }
    if (input.lotNumber) {
      const duplicate = await db
        .select({ id: coffeeTrades.id })
        .from(coffeeTrades)
        .where(and(eq(coffeeTrades.companyId, user.companyId), eq(coffeeTrades.lotNumber, input.lotNumber)))
        .limit(1);
      if (duplicate.length && duplicate[0].id !== id) {
        throw new ConflictException("A coffee trade with this lot number already exists");
      }
    }

    const payload: Record<string, unknown> = { updatedAt: new Date() };
    if (input.lotNumber !== undefined) payload.lotNumber = input.lotNumber;
    if (input.grade !== undefined) payload.grade = input.grade;
    if (input.weightKg !== undefined) payload.weightKg = input.weightKg;
    if (input.moisturePct !== undefined) payload.moisturePct = input.moisturePct;
    if (input.contactId !== undefined) payload.contactId = input.contactId;
    if (input.tradeType !== undefined) payload.tradeType = input.tradeType;
    if (input.tradeDate !== undefined) payload.tradeDate = new Date(input.tradeDate);
    if (input.notes !== undefined) payload.notes = input.notes || null;

    await db
      .update(coffeeTrades)
      .set(payload as any)
      .where(and(eq(coffeeTrades.companyId, user.companyId), eq(coffeeTrades.id, id)));

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "coffee_trade.updated",
      entityType: "coffee_trade",
      entityId: id,
      beforeData: existing[0],
      afterData: payload,
    });

    return { id, message: "Coffee trade updated" };
  }
}
