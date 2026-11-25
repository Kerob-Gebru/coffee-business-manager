import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { db } from "../database/client";
import { auditLogs, companies, passwordResetTokens, roles, users } from "../database/schema";
import { CurrentUser } from "../common/current-user.decorator";
import { ALL_PERMISSIONS, can } from "../common/permissions";
import { Public } from "../common/public.decorator";
import { writeAudit } from "../common/tenant";
import type { SessionUser } from "../common/session-user";
import { shouldSuspendCompanyAfterUserDeletion } from "./account-deletion";
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@coffee/validation";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const BCRYPT_COST = 12;

function firstError(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Validation failed";
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

async function destroyUserSessions(
  req: Request,
  userId: number,
  includeCurrent: boolean,
): Promise<number> {
  const store = req.sessionStore as {
    all?: (cb: (err: unknown, obj?: Record<string, any> | any[] | null) => void) => void;
    destroy: (sid: string, cb?: (err?: unknown) => void) => void;
  };
  if (!store?.all) return 0;
  const allSessions = await new Promise<Record<string, any> | any[] | null>((resolve) => {
    store.all!((err, obj) => resolve(err ? null : obj ?? null));
  });
  if (!allSessions) return 0;
  const entries = Array.isArray(allSessions)
    ? allSessions.map((s) => [s?.id, s] as const)
    : Object.entries(allSessions);
  let count = 0;
  for (const [sid, sess] of entries) {
    if (!sid || !sess) continue;
    if (sess.user?.id !== userId) continue;
    if (!includeCurrent && sid === req.sessionID) continue;
    await new Promise<void>((resolve) => {
      store.destroy(sid, () => resolve());
    });
    count += 1;
  }
  return count;
}

async function ensureRole(name: string, description: string): Promise<number> {
  const existing = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
  if (existing.length) return existing[0].id;
  try {
    const result = await db.insert(roles).values({ name, description });
    return Number(result[0].insertId);
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") {
      const again = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
      if (again.length) return again[0].id;
    }
    throw error;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Controller("auth")
export class AuthController {
  @Public()
  @Post("register")
  async register(@Body() body: unknown, @Req() req: Request) {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstError(parsed.error));
    const input = parsed.data;
    const email = input.email.toLowerCase();

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) {
      throw new ConflictException("An account with this email already exists. Please sign in instead.");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const ownerRoleId = await ensureRole("owner", "Workspace owner");

    const created = await db.transaction(async (tx) => {
      const companyResult = await tx.insert(companies).values({ name: input.companyName });
      const companyId = Number(companyResult[0].insertId);

      const userResult = await tx.insert(users).values({
        companyId,
        fullName: input.fullName,
        email,
        passwordHash,
        roleId: ownerRoleId,
        passwordChangedAt: new Date(),
      });
      const userId = Number(userResult[0].insertId);

      await tx.insert(auditLogs).values({
        companyId,
        userId,
        action: "company.registered",
        entityType: "company",
        entityId: String(companyId),
        afterData: { name: input.companyName, email } as any,
        reason: "Public workspace registration",
      });

      return { companyId, userId };
    });

    await regenerateSession(req);
    const sessionUser: SessionUser = {
      id: created.userId,
      companyId: created.companyId,
      fullName: input.fullName,
      email,
      role: "owner",
    };
    req.session.user = sessionUser;
    req.session.issuedAt = Date.now();
    await saveSession(req);

    return {
      user: sessionUser,
      company: { id: created.companyId, name: input.companyName },
    };
  }

  @Public()
  @Post("login")
  async login(@Body() body: unknown, @Req() req: Request) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new UnauthorizedException("Invalid email or password");

    const email = parsed.data.email.toLowerCase();
    const rows = await db
      .select({
        id: users.id,
        companyId: users.companyId,
        fullName: users.fullName,
        email: users.email,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
        role: roles.name,
        companyName: companies.name,
        companyStatus: companies.status,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(companies, eq(users.companyId, companies.id))
      .where(eq(users.email, email))
      .limit(1);

    const user = rows[0];
    const passwordMatches =
      !!user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (user.companyStatus !== "active") {
      throw new UnauthorizedException("This workspace is suspended. Contact your workspace owner.");
    }

    await regenerateSession(req);
    const sessionUser: SessionUser = {
      id: user.id,
      companyId: user.companyId,
      fullName: user.fullName,
      email: user.email,
      role: user.role ?? "staff",
    };
    req.session.user = sessionUser;
    req.session.issuedAt = Date.now();
    await saveSession(req);

    return {
      user: sessionUser,
      company: { id: user.companyId, name: user.companyName ?? "" },
    };
  }

  @Public()
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie("coffee.sid");
    if (!req.session) return { ok: true };
    return new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) return reject(err);
        resolve({ ok: true });
      });
    });
  }

  @Post("logout-all")
  async logoutAll(
    @CurrentUser() user: SessionUser,
    @Body() body: { includeCurrent?: boolean } | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const includeCurrent = body?.includeCurrent === true;
    const revokedAt = new Date();

    await db
      .update(users)
      .set({ passwordChangedAt: revokedAt })
      .where(eq(users.id, user.id));

    const revokedSessions = await destroyUserSessions(req, user.id, includeCurrent);

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "auth.logout_all",
      entityType: "user",
      entityId: user.id,
      afterData: { includeCurrent, revokedSessions } as any,
      reason: includeCurrent
        ? "User signed out from all devices"
        : "User signed out from all other devices",
    });

    if (includeCurrent) {
      res.clearCookie("coffee.sid");
      if (req.session) {
        await new Promise<void>((resolve) => {
          req.session.destroy(() => resolve());
        });
      }
      return { ok: true, signedOutCurrent: true, revokedSessions };
    }

    req.session.issuedAt = Math.max(Date.now() + 1000, revokedAt.getTime() + 1000);
    await saveSession(req);
    return { ok: true, signedOutCurrent: false, revokedSessions };
  }

  @Get("me")
  async me(@CurrentUser() user: SessionUser) {
    const rows = await db
      .select({ id: companies.id, name: companies.name, status: companies.status })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1);
    return {
      user,
      company: rows[0] ?? null,
      permissions: ALL_PERMISSIONS.filter((permission) => can(user, permission)),
    };
  }

  @Post("change-password")
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstError(parsed.error));

    const rows = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new UnauthorizedException("Please sign in");

    const matches = await bcrypt.compare(parsed.data.currentPassword, row.passwordHash);
    if (!matches) throw new BadRequestException("Current password is incorrect");
    if (parsed.data.currentPassword === parsed.data.newPassword) {
      throw new BadRequestException("New password must be different from the current password");
    }

    const changedAt = new Date();
    await db
      .update(users)
      .set({
        passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST),
        mustChangePassword: false,
        passwordChangedAt: changedAt,
      })
      .where(eq(users.id, user.id));

    await destroyUserSessions(req, user.id, false);
    req.session.issuedAt = Math.max(Date.now() + 1000, changedAt.getTime() + 1000);
    await saveSession(req);

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "auth.password_changed",
      entityType: "user",
      entityId: user.id,
      reason: "User changed their own password",
    });

    return { ok: true, message: "Password updated" };
  }

  @Post("delete-account")
  async deleteAccount(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstError(parsed.error));

    const rows = await db
      .select({
        id: users.id,
        companyId: users.companyId,
        fullName: users.fullName,
        email: users.email,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const row = rows[0];
    if (!row || !row.isActive) {
      throw new UnauthorizedException("Please sign in");
    }

    const matches = await bcrypt.compare(parsed.data.currentPassword, row.passwordHash);
    if (!matches) {
      throw new BadRequestException("Current password is incorrect");
    }

    await db.transaction(async (tx) => {
      const companyUsers = await tx
        .select({ id: users.id, isActive: users.isActive })
        .from(users)
        .where(eq(users.companyId, row.companyId));

      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, row.id));
      await tx.delete(users).where(eq(users.id, row.id));

      if (shouldSuspendCompanyAfterUserDeletion(companyUsers, row.id)) {
        await tx
          .update(companies)
          .set({ status: "suspended" })
          .where(eq(companies.id, row.companyId));
      }

      await tx.insert(auditLogs).values({
        companyId: row.companyId,
        userId: null,
        action: "auth.account_deleted",
        entityType: "user",
        entityId: String(row.id),
        beforeData: {
          email: row.email,
          fullName: row.fullName,
          role: user.role,
        } as any,
        reason: "User permanently deleted their account",
      });
    });

    await destroyUserSessions(req, row.id, true);
    res.clearCookie("coffee.sid");
    if (req.session) {
      await new Promise<void>((resolve) => {
        req.session.destroy(() => resolve());
      });
    }

    return { ok: true, message: "Account permanently deleted" };
  }

  @Public()
  @Post("forgot-password")
  async forgotPassword(@Body() body: unknown, @Req() req: Request) {
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstError(parsed.error));

    const email = parsed.data.email.toLowerCase();
    const genericResponse = {
      ok: true,
      message: "If an account exists for that email, a password reset link has been created.",
    };

    const rows = await db
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const user = rows[0];
    if (!user || !user.isActive) return genericResponse;

    const now = new Date();
    await db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
          lt(passwordResetTokens.expiresAt, now),
        ),
      );

    const token = randomBytes(32).toString("hex");
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      requestIp: (req.ip ?? "").slice(0, 45) || null,
    });

    // No mail transport is configured yet. Outside production the token is
    // returned so the reset flow can be completed; production callers must
    // deliver it out-of-band instead.
    if (process.env.NODE_ENV !== "production") {
      return { ...genericResponse, devResetToken: token, devResetExpiresInMinutes: 60 };
    }
    return genericResponse;
  }

  @Public()
  @Post("reset-password")
  async resetPassword(@Body() body: unknown) {
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstError(parsed.error));

    const now = new Date();
    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(parsed.data.token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .limit(1);
    const tokenRow = rows[0];
    if (!tokenRow) {
      throw new BadRequestException("This password reset link is invalid or has expired");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST),
          mustChangePassword: false,
          passwordChangedAt: now,
        })
        .where(eq(users.id, tokenRow.userId));

      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, tokenRow.id));

      await tx
        .delete(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, tokenRow.userId),
            isNull(passwordResetTokens.usedAt),
          ),
        );
    });

    return { ok: true, message: "Password has been reset. You can now sign in." };
  }
}
