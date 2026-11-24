import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { and, desc, eq, like, type SQL } from "drizzle-orm";
import { db } from "../database/client";
import { inventoryItems, stockMovements } from "../database/schema";
import { inventoryItemSchema, stockMovementSchema } from "@coffee/validation";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import { writeAudit } from "../common/tenant";
import type { SessionUser } from "../common/session-user";

function parseId(value: string): number {
  const id = Number(value);
  if (!id || isNaN(id)) throw new BadRequestException("Invalid record ID");
  return id;
}

@Controller("inventory")
export class InventoryController {
  @Get()
  async list(@CurrentUser() user: SessionUser, @Query("q") q = "", @Query("warehouse") warehouse = "") {
    assertCan(user, "modules.view");

    const conditions: SQL<unknown>[] = [eq(inventoryItems.companyId, user.companyId)];
    if (q.trim()) conditions.push(like(inventoryItems.itemName, `%${q.trim()}%`));
    if (warehouse.trim()) conditions.push(like(inventoryItems.warehouseLocation, `%${warehouse.trim()}%`));

    return db
      .select()
      .from(inventoryItems)
      .where(and(...conditions))
      .orderBy(desc(inventoryItems.updatedAt), desc(inventoryItems.id))
      .limit(300);
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    assertCan(user, "modules.manage");

    const parsed = inventoryItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    const result = await db.insert(inventoryItems).values({
      companyId: user.companyId,
      itemName: input.itemName,
      warehouseLocation: input.warehouseLocation,
      bagCount: input.bagCount,
      totalWeightKg: input.totalWeightKg,
      createdBy: user.id,
    });
    const id = Number(result[0].insertId);

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "inventory_item.created",
      entityType: "inventory_item",
      entityId: id,
      afterData: input,
    });

    return { id, message: "Inventory item created" };
  }

  @Get(":id/movements")
  async listMovements(@CurrentUser() user: SessionUser, @Param("id") idParam: string) {
    assertCan(user, "modules.view");
    const id = parseId(idParam);

    const item = await db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.companyId, user.companyId), eq(inventoryItems.id, id)))
      .limit(1);
    if (!item.length) throw new NotFoundException(`Inventory item #${id} not found`);

    return db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.companyId, user.companyId), eq(stockMovements.inventoryItemId, id)))
      .orderBy(desc(stockMovements.movementDate), desc(stockMovements.id))
      .limit(300);
  }

  @Post(":id/movements")
  async createMovement(
    @CurrentUser() user: SessionUser,
    @Param("id") idParam: string,
    @Body() body: unknown,
  ) {
    assertCan(user, "modules.manage");
    const id = parseId(idParam);

    const parsed = stockMovementSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.companyId, user.companyId), eq(inventoryItems.id, id)))
        .limit(1)
        .for("update");
      const item = rows[0];
      if (!item) throw new NotFoundException(`Inventory item #${id} not found`);

      const sign = input.direction === "in" ? 1 : -1;
      const nextBags = item.bagCount + sign * input.bagQuantity;
      const nextWeight = Number(item.totalWeightKg) + sign * Number(input.weightKg);
      if (nextBags < 0) {
        throw new BadRequestException("Stock-out exceeds the recorded bag count for this item");
      }
      if (nextWeight < -0.0005) {
        throw new BadRequestException("Stock-out exceeds the recorded weight for this item");
      }

      await tx
        .update(inventoryItems)
        .set({
          bagCount: nextBags,
          totalWeightKg: Math.max(nextWeight, 0).toFixed(3),
          updatedAt: new Date(),
        })
        .where(and(eq(inventoryItems.companyId, user.companyId), eq(inventoryItems.id, id)));

      const movementResult = await tx.insert(stockMovements).values({
        companyId: user.companyId,
        inventoryItemId: id,
        direction: input.direction,
        bagQuantity: input.bagQuantity,
        weightKg: input.weightKg,
        movementDate: new Date(input.movementDate),
        reference: input.reference || null,
        createdBy: user.id,
      });

      return {
        movementId: Number(movementResult[0].insertId),
        bagCount: nextBags,
        totalWeightKg: Math.max(nextWeight, 0).toFixed(3),
        before: item,
      };
    });

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: `stock_movement.${input.direction}`,
      entityType: "inventory_item",
      entityId: id,
      beforeData: {
        bagCount: result.before.bagCount,
        totalWeightKg: result.before.totalWeightKg,
      },
      afterData: { bagCount: result.bagCount, totalWeightKg: result.totalWeightKg, ...input },
    });

    return {
      id: result.movementId,
      bagCount: result.bagCount,
      totalWeightKg: result.totalWeightKg,
      message: "Stock movement recorded",
    };
  }
}
