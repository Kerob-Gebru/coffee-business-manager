export const CONTACT_TYPES = ["customer", "supplier", "exporter", "employee", "driver", "other"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];
export type CurrencyCode = "ETB" | "USD" | string;
export type SyncStatus = "confirmed" | "pending" | "conflict";
export interface ContactSummary { id: number; name: string; phone: string | null; email?: string | null; address?: string | null; notes?: string | null; roles: string[]; isActive?: boolean; createdAt: string; updatedAt?: string; }
