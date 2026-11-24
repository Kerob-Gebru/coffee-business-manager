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
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../database/client";
import { contacts, machines, processingBatches, products } from "../database/schema";
import { processingBatchSchema, processingCompleteSchema } from "@coffee/validation";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import { belongsToCompany, writeAudit } from "../common/tenant";
import type { SessionUser } from "../common/session-user";

function parseId(value: string): number {
  const id = Number(value);
  if (!id || isNaN(id)) throw new BadRequestException("Invalid record ID");
  return id;
}

@Controller("processing-batches")
export class ProcessingController {
  @Get()
  async list(@CurrentUser() user: SessionUser, @Query("status") status = "") {
    assertCan(user, "modules.view");

    const conditions: SQL<unknown>[] = [eq(processingBatches.companyId, user.companyId)];
    if (["planned", "running", "completed", "cancelled"].includes(status)) {
      conditions.push(eq(processingBatches.status, status as any));
    }

    return db
      .select({
        id: processingBatches.id,
        batchCode: processingBatches.batchCode,
        machineId: processingBatches.machineId,
        machineName: machines.name,
        operatorContactId: processingBatches.operatorContactId,
        operatorName: contacts.name,
        inputProductId: processingBatches.inputProductId,
        inputQuantity: processingBatches.inputQuantity,
        outputQuantity: processingBatches.outputQuantity,
        wasteQuantity: processingBatches.wasteQuantity,
        processingMethod: processingBatches.processingMethod,
        startedAt: processingBatches.startedAt,
        completedAt: processingBatches.completedAt,
        status: processingBatches.status,
        notes: processingBatches.notes,
        createdAt: processingBatches.createdAt,
      })
      .from(processingBatches)
      .leftJoin(
        machines,
        and(eq(machines.companyId, processingBatches.companyId), eq(machines.id, processingBatches.machineId)),
      )
      .leftJoin(
        contacts,
        and(eq(contacts.companyId, processingBatches.companyId), eq(contacts.id, processingBatches.operatorContactId)),
      )
      .where(and(...conditions))
      .orderBy(desc(processingBatches.startedAt), desc(processingBatches.id))
      .limit(200);
  }

  @Get(":id")
  async getOne(@CurrentUser() user: SessionUser, @Param("id") idParam: string) {
    assertCan(user, "modules.view");
    const id = parseId(idParam);
    const rows = await db
      .select()
      .from(processingBatches)
      .where(and(eq(processingBatches.companyId, user.companyId), eq(processingBatches.id, id)))
      .limit(1);
    if (!rows.length) throw new NotFoundException(`Processing batch #${id} not found`);
    return rows[0];
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    assertCan(user, "modules.manage");

    const parsed = processingBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    if (input.machineId && !(await belongsToCompany(machines, input.machineId, user.companyId))) {
      throw new BadRequestException("Selected machine does not belong to this workspace");
    }
    if (input.operatorContactId && !(await belongsToCompany(contacts, input.operatorContactId, user.companyId))) {
      throw new BadRequestException("Selected operator does not belong to this workspace");
    }
    if (input.inputProductId && !(await belongsToCompany(products, input.inputProductId, user.companyId))) {
      throw new BadRequestException("Selected product does not belong to this workspace");
    }

    const duplicate = await db
      .select({ id: processingBatches.id })
      .from(processingBatches)
      .where(
        and(
          eq(processingBatches.companyId, user.companyId),
          eq(processingBatches.batchCode, input.batchCode),
        ),
      )
      .limit(1);
    if (duplicate.length) {
      throw new ConflictException("A processing batch with this batch code already exists");
    }

    const result = await db.insert(processingBatches).values({
      companyId: user.companyId,
      batchCode: input.batchCode,
      machineId: input.machineId ?? null,
      operatorContactId: input.operatorContactId ?? null,
      inputProductId: input.inputProductId ?? null,
      inputQuantity: input.inputQuantity,
      outputQuantity: input.outputQuantity ?? null,
      processingMethod: input.processingMethod ?? null,
      startedAt: new Date(input.startedAt),
      wasteQuantity: input.wasteQuantity ?? null,
      status: "planned",
      notes: input.notes || null,
      createdBy: user.id,
    });
    const id = Number(result[0].insertId);

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "processing_batch.created",
      entityType: "processing_batch",
      entityId: id,
      afterData: input,
    });

    return { id, message: "Processing batch recorded" };
  }

  @Patch(":id/complete")
  async complete(
    @CurrentUser() user: SessionUser,
    @Param("id") idParam: string,
    @Body() body: unknown,
  ) {
    assertCan(user, "modules.manage");
    const id = parseId(idParam);

    const parsed = processingCompleteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    const existingRows = await db
      .select()
      .from(processingBatches)
      .where(and(eq(processingBatches.companyId, user.companyId), eq(processingBatches.id, id)))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) throw new NotFoundException(`Processing batch #${id} not found`);
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new BadRequestException(`Batch is already ${existing.status}`);
    }
    if (Number(input.outputQuantity) > Number(existing.inputQuantity)) {
      throw new BadRequestException("Output quantity cannot exceed input quantity");
    }

    await db
      .update(processingBatches)
      .set({
        outputQuantity: input.outputQuantity,
        wasteQuantity: input.wasteQuantity ?? null,
        processingMethod: input.processingMethod ?? existing.processingMethod,
        completedAt: input.completedAt ? new Date(input.completedAt) : new Date(),
        status: "completed",
        updatedAt: new Date(),
      })
      .where(and(eq(processingBatches.companyId, user.companyId), eq(processingBatches.id, id)));

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "processing_batch.completed",
      entityType: "processing_batch",
      entityId: id,
      beforeData: existing,
      afterData: { outputQuantity: input.outputQuantity, wasteQuantity: input.wasteQuantity ?? null },
    });

    return { id, message: "Processing batch completed" };
  }
}
