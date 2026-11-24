import { BadRequestException, Body, Controller, Get, Patch } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "../database/client";
import { companies } from "../database/schema";
import { companyUpdateSchema } from "@coffee/validation";
import { CurrentUser } from "../common/current-user.decorator";
import { assertCan } from "../common/permissions";
import { writeAudit } from "../common/tenant";
import type { SessionUser } from "../common/session-user";

@Controller("company")
export class CompanyController {
  @Get()
  async get(@CurrentUser() user: SessionUser) {
    const rows = await db
      .select()
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1);
    return rows[0] ?? null;
  }

  @Patch()
  async update(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    assertCan(user, "company.manage");

    const parsed = companyUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Validation failed");
    }

    const before = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1);

    await db
      .update(companies)
      .set({ name: parsed.data.name })
      .where(eq(companies.id, user.companyId));

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "company.updated",
      entityType: "company",
      entityId: user.companyId,
      beforeData: before[0] ?? null,
      afterData: { name: parsed.data.name },
    });

    return { id: user.companyId, name: parsed.data.name };
  }
}
