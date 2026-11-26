import type { CommodityQuote } from "./types";

export interface CommodityValuation {
  unitLabel: "kg" | "g" | "bbl";
  unitUsd: number;
  unitEtb: number | null;
  totalUsd: number;
  totalEtb: number | null;
}

/**
 * Computes trade/cost valuation for a commodity quote given a numeric quantity.
 * - Agricultural commodities (`coffee`, `cocoa`, `sugar`): priced per kg (`usdPerKg` / `etbPerKg`).
 * - Precious metals (`gold`, `silver`): priced per gram (`usdPerGram` / `etbPerGram`).
 * - Energy (`brent`): priced per barrel (`usdPrice` / `etbPrice`).
 */
export function estimateCommodityValue(
  quote: Pick<
    CommodityQuote,
    "usdPerKg" | "etbPerKg" | "usdPerGram" | "etbPerGram" | "usdPrice" | "etbPrice"
  >,
  quantity: number | null,
  usdToEtbRate: number | null,
): CommodityValuation | null {
  let unitLabel: "kg" | "g" | "bbl" = "bbl";
  let unitUsd = quote.usdPrice;
  let unitEtb = quote.etbPrice;

  if (quote.usdPerKg !== null) {
    unitLabel = "kg";
    unitUsd = quote.usdPerKg;
    unitEtb = quote.etbPerKg;
  } else if (quote.usdPerGram !== null) {
    unitLabel = "g";
    unitUsd = quote.usdPerGram;
    unitEtb = quote.etbPerGram;
  }

  if (unitEtb === null && usdToEtbRate !== null && Number.isFinite(usdToEtbRate) && usdToEtbRate > 0) {
    unitEtb = Number((unitUsd * usdToEtbRate).toFixed(2));
  }

  if (quantity === null || !Number.isFinite(quantity) || quantity < 0) {
    return null;
  }

  const totalUsd = Number((quantity * unitUsd).toFixed(2));
  const totalEtb = unitEtb !== null ? Number((quantity * unitEtb).toFixed(2)) : null;

  return {
    unitLabel,
    unitUsd,
    unitEtb,
    totalUsd,
    totalEtb,
  };
}

export function filterCommoditiesByCategory<T extends { category: string }>(
  items: T[],
  category: "all" | "agricultural" | "metals" | "energy",
): T[] {
  if (category === "all") return items;
  return items.filter((item) => item.category === category);
}
