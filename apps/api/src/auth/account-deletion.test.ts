import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { deleteAccountSchema } from "@coffee/validation";
import { shouldSuspendCompanyAfterUserDeletion } from "./account-deletion";
import { AuthController } from "./auth.controller";
import { db } from "../database/client";
import { auditLogs, companies, users } from "../database/schema";

function createFakeReqRes(sessionId = "sid-1") {
  const destroyedSids: string[] = [];
  const clearedCookies: string[] = [];
  const session: any = {
    user: undefined,
    issuedAt: undefined,
    regenerate(cb: (err?: unknown) => void) {
      cb();
    },
    save(cb: (err?: unknown) => void) {
      cb();
    },
    destroy(cb?: (err?: unknown) => void) {
      destroyedSids.push(sessionId);
      cb?.();
    },
  };
  const req: any = {
    sessionID: sessionId,
    session,
    sessionStore: {
      all(cb: (err: unknown, obj?: Record<string, any>) => void) {
        cb(null, { [sessionId]: session });
      },
      destroy(sid: string, cb?: () => void) {
        destroyedSids.push(sid);
        cb?.();
      },
    },
  };
  const res: any = {
    clearCookie(name: string) {
      clearedCookies.push(name);
    },
  };
  return { req, res, destroyedSids, clearedCookies };
}

test("deleteAccountSchema validates currentPassword boundaries", () => {
  assert.equal(deleteAccountSchema.safeParse({ currentPassword: "ChangeMe123!" }).success, true);
  assert.equal(deleteAccountSchema.safeParse({ currentPassword: "" }).success, false);
  assert.equal(deleteAccountSchema.safeParse({}).success, false);
  assert.equal(deleteAccountSchema.safeParse({ currentPassword: "x".repeat(129) }).success, false);
});

test("shouldSuspendCompanyAfterUserDeletion checks remaining active members", () => {
  assert.equal(shouldSuspendCompanyAfterUserDeletion([{ id: 1, isActive: true }], 1), true);
  assert.equal(
    shouldSuspendCompanyAfterUserDeletion(
      [
        { id: 1, isActive: true },
        { id: 2, isActive: false },
      ],
      1,
    ),
    true,
  );
  assert.equal(
    shouldSuspendCompanyAfterUserDeletion(
      [
        { id: 1, isActive: true },
        { id: 2, isActive: true },
      ],
      1,
    ),
    false,
  );
});

test("AuthController.deleteAccount verifies password, deletes user, clears session, and records audit", async () => {
  const controller = new AuthController();
  const { req, res, destroyedSids, clearedCookies } = createFakeReqRes("sid-delete-test");
  const email = `delete-test-${Date.now()}@coffee.local`;

  const registered = await controller.register(
    {
      companyName: "Delete Test Workspace",
      fullName: "Test Owner",
      email,
      password: "Password123!",
    },
    req,
  );

  // Wrong password must fail and leave user active
  await assert.rejects(
    () =>
      controller.deleteAccount(
        registered.user,
        { currentPassword: "WrongPassword99" },
        req,
        res,
      ),
    BadRequestException,
  );

  const stillThere = await db.select().from(users).where(eq(users.id, registered.user.id));
  assert.equal(stillThere.length, 1);

  // Correct password deletes account, suspends solo workspace, clears cookie & session
  const result = await controller.deleteAccount(
    registered.user,
    { currentPassword: "Password123!" },
    req,
    res,
  );
  assert.equal(result.ok, true);
  assert.ok(clearedCookies.includes("coffee.sid"));
  assert.ok(destroyedSids.includes("sid-delete-test"));

  const remaining = await db.select().from(users).where(eq(users.id, registered.user.id));
  assert.equal(remaining.length, 0);

  const companyRows = await db
    .select()
    .from(companies)
    .where(eq(companies.id, registered.company.id));
  assert.equal(companyRows[0]?.status, "suspended");

  const logs = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.companyId, registered.company.id));
  assert.ok(logs.some((log) => log.action === "auth.account_deleted"));

  // Deleted user can no longer sign in
  await assert.rejects(
    () => controller.login({ email, password: "Password123!" }, req),
    UnauthorizedException,
  );
});
