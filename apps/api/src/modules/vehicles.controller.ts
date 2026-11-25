import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, isUsingMock, pool } from "../database/client";
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

function calcVehicleNet(
  grossAmount: string | number | null | undefined,
  costTaken: string | number | null | undefined,
): string {
  const grossCents = Math.round((Number(grossAmount || 0) || 0) * 100);
  const costCents = Math.round((Number(costTaken || 0) || 0) * 100);
  return ((grossCents - costCents) / 100).toFixed(2);
}

function deriveVehicleName(
  explicitName: string | undefined | null,
  driverName: string | undefined | null,
  registrationNumber: string,
): string {
  const cleanName = explicitName?.trim();
  if (cleanName && cleanName.length >= 2) return cleanName.slice(0, 100);
  const driver = driverName?.trim();
  const plate = registrationNumber.trim();
  if (driver && plate) return `${driver} (${plate})`.slice(0, 100);
  if (driver && driver.length >= 2) return driver.slice(0, 100);
  return plate.length >= 2 ? plate.slice(0, 100) : `Vehicle ${plate}`.slice(0, 100);
}

const VEHICLE_COLUMN_DEFS: Array<{ column: string; ddl: string }> = [
  { column: "driver_name", ddl: "ADD COLUMN driver_name VARCHAR(160) NULL" },
  { column: "cargo_item", ddl: "ADD COLUMN cargo_item VARCHAR(160) NULL" },
  { column: "cargo_owner", ddl: "ADD COLUMN cargo_owner VARCHAR(160) NULL" },
  { column: "cargo_quantity", ddl: "ADD COLUMN cargo_quantity VARCHAR(80) NULL" },
  { column: "gross_amount", ddl: "ADD COLUMN gross_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00" },
  { column: "cost_taken", ddl: "ADD COLUMN cost_taken DECIMAL(18,2) NOT NULL DEFAULT 0.00" },
  { column: "currency", ddl: "ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'ETB'" },
];

@Controller("vehicles")
export class VehiclesController implements OnModuleInit {
  private schemaCheckPromise: Promise<void> | null = null;

  async onModuleInit() {
    await this.ensureVehicleColumns().catch((err) => {
      console.warn("[Vehicles] Startup column check deferred:", err?.message || err);
    });
  }

  private async ensureVehicleColumns() {
    if (isUsingMock()) return;
    if (!this.schemaCheckPromise) {
      this.schemaCheckPromise = (async () => {
        const [rows] = await pool.query(
          `SELECT COLUMN_NAME AS columnName
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicles'`,
        );
        const existingCols = new Set(
          (Array.isArray(rows) ? rows : []).map((row: any) =>
            String(row.columnName || row.COLUMN_NAME || "").toLowerCase(),
          ),
        );
        for (const def of VEHICLE_COLUMN_DEFS) {
          if (!existingCols.has(def.column)) {
            await pool.query(`ALTER TABLE vehicles ${def.ddl}`);
          }
        }
      })().catch((err) => {
        this.schemaCheckPromise = null;
        throw err;
      });
    }
    return this.schemaCheckPromise;
  }

  @Get()
  async list(@CurrentUser() user: SessionUser, @Query("status") status = "") {
    assertCan(user, "modules.view");
    await this.ensureVehicleColumns();

    const conditions: SQL<unknown>[] = [eq(vehicles.companyId, user.companyId)];
    if (["active", "maintenance", "inactive"].includes(status)) {
      conditions.push(eq(vehicles.status, status as any));
    }

    const rows = await db
      .select({
        id: vehicles.id,
        name: vehicles.name,
        registrationNumber: vehicles.registrationNumber,
        vehicleType: vehicles.vehicleType,
        driverContactId: vehicles.driverContactId,
        driverName: vehicles.driverName,
        contactDriverName: contacts.name,
        cargoItem: vehicles.cargoItem,
        cargoOwner: vehicles.cargoOwner,
        cargoQuantity: vehicles.cargoQuantity,
        grossAmount: vehicles.grossAmount,
        costTaken: vehicles.costTaken,
        currency: vehicles.currency,
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
      .orderBy(desc(vehicles.id))
      .limit(200);

    return rows.map((row) => {
      const grossAmount = Number(row.grossAmount ?? 0).toFixed(2);
      const costTaken = Number(row.costTaken ?? 0).toFixed(2);
      return {
        id: row.id,
        name: row.name,
        registrationNumber: row.registrationNumber,
        vehicleType: row.vehicleType,
        driverContactId: row.driverContactId,
        driverName: row.driverName || row.contactDriverName || null,
        cargoItem: row.cargoItem ?? null,
        cargoOwner: row.cargoOwner ?? null,
        cargoQuantity: row.cargoQuantity ?? null,
        grossAmount,
        costTaken,
        netAmount: calcVehicleNet(grossAmount, costTaken),
        currency: (row.currency || "ETB").toUpperCase(),
        currentMileage: row.currentMileage,
        status: row.status,
        notes: row.notes,
        createdAt: row.createdAt,
      };
    });
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    assertCan(user, "modules.manage");
    await this.ensureVehicleColumns();

    const parsed = vehicleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    let resolvedDriverName = input.driverName?.trim() || "";
    if (input.driverContactId) {
      if (!(await belongsToCompany(contacts, input.driverContactId, user.companyId))) {
        throw new BadRequestException("Selected driver does not belong to this workspace");
      }
      if (!resolvedDriverName) {
        const driverRows = await db
          .select({ name: contacts.name })
          .from(contacts)
          .where(and(eq(contacts.companyId, user.companyId), eq(contacts.id, input.driverContactId)))
          .limit(1);
        resolvedDriverName = driverRows[0]?.name || "";
      }
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
      throw new ConflictException("A vehicle with this registration / plate number already exists");
    }

    const derivedName = deriveVehicleName(input.name, resolvedDriverName, input.registrationNumber);
    const grossAmount = Number(input.grossAmount || 0).toFixed(2);
    const costTaken = Number(input.costTaken || 0).toFixed(2);

    const result = await db.insert(vehicles).values({
      companyId: user.companyId,
      name: derivedName,
      registrationNumber: input.registrationNumber,
      vehicleType: input.vehicleType || null,
      driverContactId: input.driverContactId ?? null,
      driverName: resolvedDriverName || null,
      cargoItem: input.cargoItem?.trim() || null,
      cargoOwner: input.cargoOwner?.trim() || null,
      cargoQuantity: input.cargoQuantity?.trim() || null,
      grossAmount,
      costTaken,
      currency: (input.currency || "ETB").toUpperCase(),
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
      afterData: { ...input, name: derivedName, driverName: resolvedDriverName || null },
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
    await this.ensureVehicleColumns();
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
        throw new ConflictException("A vehicle with this registration / plate number already exists");
      }
    }

    const nextDriverName =
      input.driverName !== undefined ? input.driverName.trim() || null : existing.driverName;
    const nextReg = input.registrationNumber ?? existing.registrationNumber;

    const payload: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      payload.name = deriveVehicleName(input.name, nextDriverName, nextReg);
    } else if (input.driverName !== undefined || input.registrationNumber !== undefined) {
      const oldAuto = deriveVehicleName(null, existing.driverName, existing.registrationNumber);
      if (existing.name === oldAuto || existing.name === existing.registrationNumber) {
        payload.name = deriveVehicleName(null, nextDriverName, nextReg);
      }
    }
    if (input.registrationNumber !== undefined) payload.registrationNumber = input.registrationNumber;
    if (input.vehicleType !== undefined) payload.vehicleType = input.vehicleType || null;
    if (input.driverContactId !== undefined) payload.driverContactId = input.driverContactId ?? null;
    if (input.driverName !== undefined) payload.driverName = input.driverName.trim() || null;
    if (input.cargoItem !== undefined) payload.cargoItem = input.cargoItem.trim() || null;
    if (input.cargoOwner !== undefined) payload.cargoOwner = input.cargoOwner.trim() || null;
    if (input.cargoQuantity !== undefined) payload.cargoQuantity = input.cargoQuantity.trim() || null;
    if (input.grossAmount !== undefined) payload.grossAmount = Number(input.grossAmount || 0).toFixed(2);
    if (input.costTaken !== undefined) payload.costTaken = Number(input.costTaken || 0).toFixed(2);
    if (input.currency !== undefined) payload.currency = input.currency.toUpperCase();
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

  @Delete(":id")
  async remove(@CurrentUser() user: SessionUser, @Param("id") idParam: string) {
    assertCan(user, "modules.manage");
    await this.ensureVehicleColumns();
    const id = parseId(idParam);

    const existingRows = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.companyId, user.companyId), eq(vehicles.id, id)))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) throw new NotFoundException(`Vehicle #${id} not found`);

    await db.transaction(async (tx) => {
      await tx
        .delete(vehicleLogs)
        .where(and(eq(vehicleLogs.companyId, user.companyId), eq(vehicleLogs.vehicleId, id)));
      await tx
        .delete(vehicles)
        .where(and(eq(vehicles.companyId, user.companyId), eq(vehicles.id, id)));
    });

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "vehicle.deleted",
      entityType: "vehicle",
      entityId: id,
      beforeData: existing,
    });

    return { id, message: "Vehicle deleted" };
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
