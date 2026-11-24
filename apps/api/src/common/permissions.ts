import { ForbiddenException } from "@nestjs/common";
import type { SessionUser } from "./session-user";

export const ALL_PERMISSIONS = [
  "company.manage",
  "contacts.view",
  "contacts.create",
  "contacts.edit",
  "contacts.archive",
  "contacts.restore",
  "finance.view",
  "finance.create",
  "currency.view",
  "currency.override",
  "invoices.view",
  "invoices.create",
  "invoices.edit",
  "invoices.payment",
  "invoices.cancel",
  "modules.view",
  "modules.manage",
  "reports.view",
] as const;

/**
 * Role -> permission codes. "owner" is the workspace owner created by public
 * registration and must never be treated as a global administrator; every
 * permission still applies only inside the user's own company.
 */
export const ROLE_PERMISSIONS: Record<string, string[] | "*"> = {
  owner: "*",
  admin: "*",
  manager: [
    "contacts.view",
    "contacts.create",
    "contacts.edit",
    "contacts.archive",
    "contacts.restore",
    "finance.view",
    "finance.create",
    "currency.view",
    "currency.override",
    "invoices.view",
    "invoices.create",
    "invoices.edit",
    "invoices.payment",
    "invoices.cancel",
    "modules.view",
    "modules.manage",
    "reports.view",
  ],
  accountant: [
    "contacts.view",
    "contacts.create",
    "contacts.edit",
    "finance.view",
    "finance.create",
    "currency.view",
    "invoices.view",
    "invoices.create",
    "invoices.edit",
    "invoices.payment",
    "modules.view",
    "reports.view",
  ],
  staff: [
    "contacts.view",
    "contacts.create",
    "contacts.edit",
    "currency.view",
    "modules.view",
    "modules.manage",
  ],
};

export function can(user: Pick<SessionUser, "role">, permission: string): boolean {
  const granted = ROLE_PERMISSIONS[(user.role || "").toLowerCase()];
  if (!granted) return false;
  if (granted === "*") return true;
  return granted.includes(permission);
}

export function assertCan(user: Pick<SessionUser, "role">, permission: string): void {
  if (!can(user, permission)) {
    throw new ForbiddenException(
      `Your role (${user.role}) does not have permission to perform this action.`,
    );
  }
}
