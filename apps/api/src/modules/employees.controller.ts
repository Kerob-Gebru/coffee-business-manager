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
import { and, asc, eq, like, type SQL } from "drizzle-orm";
import { db } from "../database/client";
import { contacts, employees } from "../database/schema";
import { employeeSchema } from "@coffee/validation";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import { belongsToCompany, writeAudit } from "../common/tenant";
import type { SessionUser } from "../common/session-user";

function parseId(value: string): number {
  const id = Number(value);
  if (!id || isNaN(id)) throw new BadRequestException("Invalid record ID");
  return id;
}

@Controller("employees")
export class EmployeesController {
  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query("status") status = "active",
    @Query("q") q = "",
  ) {
    assertCan(user, "modules.view");

    const conditions: SQL<unknown>[] = [eq(employees.companyId, user.companyId)];
    if (status === "archived") conditions.push(eq(employees.isActive, false));
    else if (status !== "all") conditions.push(eq(employees.isActive, true));
    if (q.trim()) conditions.push(like(employees.fullName, `%${q.trim()}%`));

    return db
      .select({
        id: employees.id,
        fullName: employees.fullName,
        phone: employees.phone,
        jobTitle: employees.jobTitle,
        startDate: employees.startDate,
        isActive: employees.isActive,
        contactId: employees.contactId,
        contactName: contacts.name,
        createdAt: employees.createdAt,
      })
      .from(employees)
      .leftJoin(
        contacts,
        and(eq(contacts.companyId, employees.companyId), eq(contacts.id, employees.contactId)),
      )
      .where(and(...conditions))
      .orderBy(asc(employees.fullName))
      .limit(300);
  }

  @Get(":id")
  async getOne(@CurrentUser() user: SessionUser, @Param("id") idParam: string) {
    assertCan(user, "modules.view");
    const id = parseId(idParam);
    const rows = await db
      .select()
      .from(employees)
      .where(and(eq(employees.companyId, user.companyId), eq(employees.id, id)))
      .limit(1);
    if (!rows.length) throw new NotFoundException(`Employee #${id} not found`);
    return rows[0];
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    assertCan(user, "modules.manage");

    const parsed = employeeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    if (input.contactId && !(await belongsToCompany(contacts, input.contactId, user.companyId))) {
      throw new BadRequestException("Selected contact does not belong to this workspace");
    }

    const result = await db.insert(employees).values({
      companyId: user.companyId,
      fullName: input.fullName,
      phone: input.phone || null,
      jobTitle: input.jobTitle || null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      contactId: input.contactId ?? null,
      isActive: input.isActive ?? true,
      createdBy: user.id,
    });
    const id = Number(result[0].insertId);

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "employee.created",
      entityType: "employee",
      entityId: id,
      afterData: input,
    });

    return { id, message: "Employee recorded" };
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: SessionUser,
    @Param("id") idParam: string,
    @Body() body: unknown,
  ) {
    assertCan(user, "modules.manage");
    const id = parseId(idParam);

    const parsed = employeeSchema.partial().safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }
    const input = parsed.data;

    const existingRows = await db
      .select()
      .from(employees)
      .where(and(eq(employees.companyId, user.companyId), eq(employees.id, id)))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) throw new NotFoundException(`Employee #${id} not found`);

    if (input.contactId && !(await belongsToCompany(contacts, input.contactId, user.companyId))) {
      throw new BadRequestException("Selected contact does not belong to this workspace");
    }

    const payload: Record<string, unknown> = { updatedAt: new Date() };
    if (input.fullName !== undefined) payload.fullName = input.fullName;
    if (input.phone !== undefined) payload.phone = input.phone || null;
    if (input.jobTitle !== undefined) payload.jobTitle = input.jobTitle || null;
    if (input.startDate !== undefined) payload.startDate = input.startDate ? new Date(input.startDate) : null;
    if (input.contactId !== undefined) payload.contactId = input.contactId ?? null;
    if (input.isActive !== undefined) payload.isActive = input.isActive;

    await db
      .update(employees)
      .set(payload as any)
      .where(and(eq(employees.companyId, user.companyId), eq(employees.id, id)));

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "employee.updated",
      entityType: "employee",
      entityId: id,
      beforeData: existing,
      afterData: payload,
    });

    return { id, message: "Employee updated" };
  }
}
