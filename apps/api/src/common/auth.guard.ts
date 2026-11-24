import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "../database/client";
import { companies, roles, users } from "../database/schema";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { SessionUser } from "./session-user";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const sessionUser = req.session?.user;
    if (!sessionUser?.id) {
      throw new UnauthorizedException("Please sign in");
    }

    const rows = await db
      .select({
        id: users.id,
        companyId: users.companyId,
        fullName: users.fullName,
        email: users.email,
        isActive: users.isActive,
        passwordChangedAt: users.passwordChangedAt,
        role: roles.name,
        companyStatus: companies.status,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(companies, eq(users.companyId, companies.id))
      .where(eq(users.id, sessionUser.id))
      .limit(1);

    const row = rows[0];
    const revokedBeforeMs = row?.passwordChangedAt
      ? new Date(row.passwordChangedAt).getTime()
      : 0;
    const issuedAtMs = req.session.issuedAt ?? 0;
    const isSessionRevoked =
      revokedBeforeMs > 0 && (!issuedAtMs || issuedAtMs < revokedBeforeMs);

    if (
      !row ||
      !row.isActive ||
      row.companyStatus !== "active" ||
      row.companyId !== sessionUser.companyId ||
      isSessionRevoked
    ) {
      req.session.destroy(() => undefined);
      throw new UnauthorizedException("Your session is no longer valid. Please sign in again.");
    }

    const fresh: SessionUser = {
      id: row.id,
      companyId: row.companyId,
      fullName: row.fullName,
      email: row.email,
      role: row.role ?? "staff",
    };
    req.session.user = fresh;
    (req as Request & { user?: SessionUser }).user = fresh;
    return true;
  }
}
