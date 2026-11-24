import { and, eq } from "drizzle-orm";
import { db } from "../database/client";
import { auditLogs } from "../database/schema";

export function companyScope(table: { companyId: any }, companyId: number) {
  return eq(table.companyId, companyId);
}

export async function belongsToCompany(
  table: { id: any; companyId: any },
  id: number,
  companyId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: table.id })
    .from(table as any)
    .where(and(eq(table.companyId, companyId), eq(table.id, id)))
    .limit(1);
  return rows.length > 0;
}

export async function writeAudit(entry: {
  companyId: number;
  userId: number;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  beforeData?: unknown;
  afterData?: unknown;
  reason?: string | null;
}) {
  await db.insert(auditLogs).values({
    companyId: entry.companyId,
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId == null ? null : String(entry.entityId),
    beforeData: (entry.beforeData ?? null) as any,
    afterData: (entry.afterData ?? null) as any,
    reason: entry.reason ?? null,
  });
}
