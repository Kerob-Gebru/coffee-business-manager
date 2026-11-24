import "express-session";

export interface SessionUser {
  id: number;
  companyId: number;
  fullName: string;
  email: string;
  role: string;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    issuedAt?: number;
  }
}
