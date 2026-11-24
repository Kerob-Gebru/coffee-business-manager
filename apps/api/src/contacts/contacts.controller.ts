import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { and, desc, eq, like, type SQL } from "drizzle-orm";
import { db } from "../database/client";
import { auditLogs, contacts } from "../database/schema";
import { contactSchema, updateContactSchema } from "@coffee/validation";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import type { SessionUser } from "../common/session-user";

const ALLOWED_ROLES = ["customer", "supplier", "exporter", "employee", "driver", "other"] as const;

@Controller("contacts")
export class ContactsController {
  private scope(companyId: number, id: number) {
    return and(eq(contacts.companyId, companyId), eq(contacts.id, id));
  }

  private async findOwned(companyId: number, id: number) {
    const rows = await db.select().from(contacts).where(this.scope(companyId, id)).limit(1);
    if (!rows.length) throw new NotFoundException(`Contact with ID #${id} not found`);
    return rows[0];
  }

  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query("q") q = "",
    @Query("status") status = "active",
  ) {
    assertCan(user, "contacts.view");

    const conditions: SQL<unknown>[] = [eq(contacts.companyId, user.companyId)];
    if (status === "archived") {
      conditions.push(eq(contacts.isActive, false));
    } else if (status !== "all") {
      conditions.push(eq(contacts.isActive, true));
    }
    if (q.trim()) {
      conditions.push(like(contacts.name, `%${q.trim()}%`));
    }

    return db
      .select()
      .from(contacts)
      .where(and(...conditions))
      .orderBy(desc(contacts.createdAt))
      .limit(200);
  }

  @Get(":id")
  async getOne(@CurrentUser() user: SessionUser, @Param("id") idParam: string) {
    assertCan(user, "contacts.view");
    const id = Number(idParam);
    if (!id || isNaN(id)) throw new BadRequestException("Invalid contact ID");
    return this.findOwned(user.companyId, id);
  }

  @Post()
  async create(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ) {
    assertCan(user, "contacts.create");

    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const validated = parsed.data;
    const cleanRoles = validated.roles.filter((r) => ALLOWED_ROLES.includes(r as any));

    return db.transaction(async (tx) => {
      const result = await tx.insert(contacts).values({
        companyId: user.companyId,
        name: validated.name,
        phone: validated.phone || null,
        email: validated.email || null,
        address: validated.address || null,
        notes: validated.notes || null,
        roles: cleanRoles,
        isActive: true,
      });
      const newId = Number(result[0].insertId);

      const createdRecord = {
        id: newId,
        companyId: user.companyId,
        name: validated.name,
        phone: validated.phone || null,
        email: validated.email || null,
        address: validated.address || null,
        notes: validated.notes || null,
        roles: cleanRoles,
        isActive: true,
      };

      await tx.insert(auditLogs).values({
        companyId: user.companyId,
        userId: user.id,
        action: "contact.created",
        entityType: "contact",
        entityId: String(newId),
        afterData: createdRecord as any,
        reason: "Initial contact creation",
      });

      return createdRecord;
    });
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: SessionUser,
    @Param("id") idParam: string,
    @Body() body: unknown,
  ) {
    assertCan(user, "contacts.edit");

    const id = Number(idParam);
    if (!id || isNaN(id)) throw new BadRequestException("Invalid contact ID");

    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const validated = parsed.data;
    const previous = await this.findOwned(user.companyId, id);

    const updatedRoles = validated.roles
      ? validated.roles.filter((r) => ALLOWED_ROLES.includes(r as any))
      : previous.roles;
    if (validated.roles && !updatedRoles.length) {
      throw new BadRequestException("At least one valid contact role is required");
    }

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    if (validated.name !== undefined) updatePayload.name = validated.name;
    if (validated.phone !== undefined) updatePayload.phone = validated.phone || null;
    if (validated.email !== undefined) updatePayload.email = validated.email || null;
    if (validated.address !== undefined) updatePayload.address = validated.address || null;
    if (validated.notes !== undefined) updatePayload.notes = validated.notes || null;
    if (validated.roles !== undefined) updatePayload.roles = updatedRoles;

    return db.transaction(async (tx) => {
      await tx.update(contacts).set(updatePayload as any).where(this.scope(user.companyId, id));

      const updatedRecord = { ...previous, ...updatePayload };

      await tx.insert(auditLogs).values({
        companyId: user.companyId,
        userId: user.id,
        action: "contact.updated",
        entityType: "contact",
        entityId: String(id),
        beforeData: previous as any,
        afterData: updatedRecord as any,
        reason: "Contact updated by user",
      });

      return updatedRecord;
    });
  }

  @Post(":id/archive")
  async archive(
    @CurrentUser() user: SessionUser,
    @Param("id") idParam: string,
    @Body() body: { reason?: string } | undefined,
  ) {
    assertCan(user, "contacts.archive");

    const id = Number(idParam);
    if (!id || isNaN(id)) throw new BadRequestException("Invalid contact ID");

    const previous = await this.findOwned(user.companyId, id);
    if (!previous.isActive) {
      return { success: true, message: "Contact is already archived", id };
    }

    const reason = body?.reason?.trim() || "Archived by authorized user";

    return db.transaction(async (tx) => {
      await tx
        .update(contacts)
        .set({ isActive: false, updatedAt: new Date() })
        .where(this.scope(user.companyId, id));

      await tx.insert(auditLogs).values({
        companyId: user.companyId,
        userId: user.id,
        action: "contact.archived",
        entityType: "contact",
        entityId: String(id),
        beforeData: previous as any,
        afterData: { ...previous, isActive: false } as any,
        reason,
      });

      return { success: true, message: "Contact archived successfully", id };
    });
  }

  @Post(":id/restore")
  async restore(@CurrentUser() user: SessionUser, @Param("id") idParam: string) {
    assertCan(user, "contacts.restore");

    const id = Number(idParam);
    if (!id || isNaN(id)) throw new BadRequestException("Invalid contact ID");

    const previous = await this.findOwned(user.companyId, id);
    if (previous.isActive) {
      return { success: true, message: "Contact is already active", id };
    }

    return db.transaction(async (tx) => {
      await tx
        .update(contacts)
        .set({ isActive: true, updatedAt: new Date() })
        .where(this.scope(user.companyId, id));

      await tx.insert(auditLogs).values({
        companyId: user.companyId,
        userId: user.id,
        action: "contact.restored",
        entityType: "contact",
        entityId: String(id),
        beforeData: previous as any,
        afterData: { ...previous, isActive: true } as any,
        reason: "Restored to active contacts",
      });

      return { success: true, message: "Contact restored successfully", id };
    });
  }
}
