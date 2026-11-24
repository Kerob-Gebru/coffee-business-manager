import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db, pool } from "./client";
import { companies, currencies, permissions, rolePermissions, roles, users } from "./schema";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from "../common/permissions";

const LEGACY_COMPANY_ID = 1;
const LEGACY_COMPANY_NAME = "Legacy Workspace";

async function ensureRole(name: string, description: string): Promise<number> {
  const existing = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
  if (existing.length) return existing[0].id;
  const result = await db.insert(roles).values({ name, description });
  return Number(result[0].insertId);
}

async function seedPermissions() {
  const ids = new Map<string, number>();
  for (const code of ALL_PERMISSIONS) {
    const existing = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.code, code))
      .limit(1);
    if (existing.length) {
      ids.set(code, existing[0].id);
    } else {
      const result = await db.insert(permissions).values({ code });
      ids.set(code, Number(result[0].insertId));
    }
  }

  for (const [roleName, granted] of Object.entries(ROLE_PERMISSIONS)) {
    const roleRows = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, roleName)).limit(1);
    const roleId = roleRows[0]?.id;
    if (!roleId) continue;
    const codes = granted === "*" ? ALL_PERMISSIONS : granted;
    for (const code of codes) {
      const permissionId = ids.get(code);
      if (!permissionId) continue;
      const existing = await db
        .select({ id: rolePermissions.id })
        .from(rolePermissions)
        .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)))
        .limit(1);
      if (!existing.length) {
        await db.insert(rolePermissions).values({ roleId, permissionId });
      }
    }
  }
}

async function seed() {
  const companyRows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, LEGACY_COMPANY_ID))
    .limit(1);
  if (!companyRows.length) {
    await db.insert(companies).values({ id: LEGACY_COMPANY_ID, name: LEGACY_COMPANY_NAME, status: "active" });
  }

  for (const [name, description] of [
    ["owner", "Workspace owner"],
    ["admin", "Full system access"],
    ["manager", "Business operations and approvals"],
    ["accountant", "Financial records and reports"],
    ["staff", "Limited daily data entry"],
  ] as const) {
    await ensureRole(name, description);
  }

  for (const [code, name, symbol, isBase] of [
    ["ETB", "Ethiopian Birr", "Br", true],
    ["USD", "United States Dollar", "$", false],
  ] as const) {
    const existing = await db.select().from(currencies).where(eq(currencies.code, code)).limit(1);
    if (!existing.length) await db.insert(currencies).values({ code, name, symbol, isBase });
  }

  await seedPermissions();

  const adminRole = (await db.select().from(roles).where(eq(roles.name, "admin")).limit(1))[0];
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@coffee.local").toLowerCase();
  const existingAdmin = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1);

  if (!existingAdmin.length) {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error(
        "No administrator exists. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create the initial administrator.",
      );
    }
    const adminName = process.env.SEED_ADMIN_NAME ?? "System Administrator";
    await db.insert(users).values({
      companyId: LEGACY_COMPANY_ID,
      fullName: adminName,
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      roleId: adminRole.id,
      passwordChangedAt: new Date(),
    });
    console.log(`Created initial administrator for ${LEGACY_COMPANY_NAME} using environment credentials.`);
  } else {
    console.log("Existing administrator preserved; no credentials were changed.");
  }

  console.log("Seed completed.");
  await pool.end();
}

seed().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
