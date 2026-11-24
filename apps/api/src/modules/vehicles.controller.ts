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
import { contacts, vehicleLogs, vehicles } from "../database/schema";
import { vehicleLogSchema, vehicleSchema } from "@coffee/validation";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import { belongsToCompany, writeAudit } from "../common/tenant";
import type { SessionUser } from "../common/session-user";

function parseId(value: string): number {
  const id = Number(value);
  if (!id || isNaN(id)) throw new BadRequestException("Invalid record ID");
  return id;
}

@Controller("vehicles")
export class VehiclesController {
  @Get()
  async list(@CurrentUser() user: SessionUser, @Query("status") status = "") {
    assertCan(user, "modules.view");

    const conditions: SQL<unknown>[] = [eq(vehicles.companyId, user.companyId)];
    if (["active", "maintenance", "inactive"].includes(status)) {
      conditions.push(eq(vehicles.status, status as any));
    }

    return db
      .select({
        id: vehicles.id,
        name: vehicles.name,
        registrationNumber: vehicles.registrationNumber,
        vehicleType: vehicles.vehicleType,
        driverContactId: vehicles.driverContactId,
        driverName: contacts.name,
        currentMileage: vehicles.currentMileage,
        status: vehicles.status,
        notes: vehicles.notes,
        createdAt: vehicles.createdAt,
      })
      .from(vehicles)
      .leftJoin(
        contacts,
        and(eq(contacts.companyId, vehicles.companyId), eq(contacts.id, vehicles.driverContactId)),
      )
      .where(and(...conditions))
      .orderBy(vehicles.name)
      .limit(200);
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    assertCan(user, "modules.manage");

    const parsed = vehicleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    if (input.driverContactId && !(await belongsToCompany(contacts, input.driverContactId, user.companyId))) {
      throw new BadRequestException("Selected driver does not belong to this workspace");
    }

    const duplicate = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.companyId, user.companyId),
          eq(vehicles.registrationNumber, input.registrationNumber),
        ),
      )
      .limit(1);
    if (duplicate.length) {
      throw new ConflictException("A vehicle with this registration number already exists");
    }

    const result = await db.insert(vehicles).values({
      companyId: user.companyId,
      name: input.name,
      registrationNumber: input.registrationNumber,
      vehicleType: input.vehicleType || null,
      driverContactId: input.driverContactId ?? null,
      currentMileage: input.currentMileage,
      status: input.status,
      notes: input.notes || null,
    });
    const id = Number(result[0].insertId);

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "vehicle.created",
      entityType: "vehicle",
      entityId: id,
      afterData: input,
    });

    return { id, message: "Vehicle recorded" };
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: SessionUser,
    @Param("id") idParam: string,
    @Body() body: unknown,
  ) {
    assertCan(user, "modules.manage");
    const id = parseId(idParam);

    const parsed = vehicleSchema.partial().safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    const existingRows = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.companyId, user.companyId), eq(vehicles.id, id)))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) throw new NotFoundException(`Vehicle #${id} not found`);

    if (input.driverContactId && !(await belongsToCompany(contacts, input.driverContactId, user.companyId))) {
      throw new BadRequestException("Selected driver does not belong to this workspace");
    }
    if (input.registrationNumber) {
      const duplicate = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.companyId, user.companyId),
            eq(vehicles.registrationNumber, input.registrationNumber),
          ),
        )
        .limit(1);
      if (duplicate.length && duplicate[0].id !== id) {
        throw new ConflictException("A vehicle with this registration number already exists");
      }
    }

    const payload: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) payload.name = input.name;
    if (input.registrationNumber !== undefined) payload.registrationNumber = input.registrationNumber;
    if (input.vehicleType !== undefined) payload.vehicleType = input.vehicleType || null;
    if (input.driverContactId !== undefined) payload.driverContactId = input.driverContactId ?? null;
    if (input.currentMileage !== undefined) payload.currentMileage = input.currentMileage;
    if (input.status !== undefined) payload.status = input.status;
    if (input.notes !== undefined) payload.notes = input.notes || null;

    await db
      .update(vehicles)
      .set(payload as any)
      .where(and(eq(vehicles.companyId, user.companyId), eq(vehicles.id, id)));

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "vehicle.updated",
      entityType: "vehicle",
      entityId: id,
      beforeData: existing,
      afterData: payload,
    });

    return { id, message: "Vehicle updated" };
  }

  @Get(":id/logs")
  async listLogs(@CurrentUser() user: SessionUser, @Param("id") idParam: string) {
    assertCan(user, "modules.view");
    const id = parseId(idParam);

    const vehicle = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.companyId, user.companyId), eq(vehicles.id, id)))
      .limit(1);
    if (!vehicle.length) throw new NotFoundException(`Vehicle #${id} not found`);

    return db
      .select()
      .from(vehicleLogs)
      .where(and(eq(vehicleLogs.companyId, user.companyId), eq(vehicleLogs.vehicleId, id)))
      .orderBy(desc(vehicleLogs.logDate), desc(vehicleLogs.id))
      .limit(300);
  }

  @Post(":id/logs")
  async createLog(
    @CurrentUser() user: SessionUser,
    @Param("id") idParam: string,
    @Body() body: unknown,
  ) {
    assertCan(user, "modules.manage");
    const id = parseId(idParam);

    const parsed = vehicleLogSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.companyId, user.companyId), eq(vehicles.id, id)))
        .limit(1)
        .for("update");
      const vehicle = rows[0];
      if (!vehicle) throw new NotFoundException(`Vehicle #${id} not found`);

      const logResult = await tx.insert(vehicleLogs).values({
        companyId: user.companyId,
        vehicleId: id,
        logType: input.logType,
        description: input.description,
        mileageKm: input.mileageKm,
        logDate: new Date(input.logDate),
        cost: input.cost || null,
        currency: input.currency.toUpperCase(),
        notes: input.notes || null,
        createdBy: user.id,
      });

      if (Number(input.mileageKm) > Number(vehicle.currentMileage)) {
        await tx
          .update(vehicles)
          .set({ currentMileage: input.mileageKm, updatedAt: new Date() })
          .where(and(eq(vehicles.companyId, user.companyId), eq(vehicles.id, id)));
      }

      return { logId: Number(logResult[0].insertId), previousMileage: vehicle.currentMileage };
    });

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: `vehicle_log.${input.logType}`,
      entityType: "vehicle",
      entityId: id,
      beforeData: { currentMileage: result.previousMileage },
      afterData: input,
    });

    return { id: result.logId, message: "Vehicle log recorded" };
  }
}
