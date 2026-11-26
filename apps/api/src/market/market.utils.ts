export type CommodityCategory = "agricultural" | "metals" | "energy";

export interface CommoditySpec {
  id: string;
  symbol: string;
  category: CommodityCategory;
  quoteUnit: string;
  isCents: boolean;
  /** Number of market quote units (after cents->USD conversion) per 1 kg, if applicable. */
  perKgFactor: number | null;
  /** Number of market quote units per 1 gram, for precious metals. */
  perGramFactor: number | null;
  investingUrl: string;
}

export interface CommodityHistoryPoint {
  date: string;
  close: number;
}

export interface CommodityQuote {
  id: string;
  symbol: string;
  category: CommodityCategory;
  exchange: string;
  quoteUnit: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  monthChangePercent: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  week52Low: number | null;
  week52High: number | null;
  usdPerKg: number | null;
  etbPerKg: number | null;
  usdPerGram: number | null;
  etbPerGram: number | null;
  usdPrice: number;
  etbPrice: number | null;
  marketTime: string | null;
  investingUrl: string;
  history: CommodityHistoryPoint[];
}

const LB_PER_KG = 2.20462262185;
const TROY_OZ_PER_GRAM = 1 / 31.1034768;

/**
 * Curated allowlist of global commodities directly relevant to coffee export/trading,
 * Ethiopian precious-metal/currency benchmarks, and fleet fuel logistics.
 */
export const COMMODITY_INSTRUMENTS: readonly CommoditySpec[] = [
  {
    id: "coffee",
    symbol: "KC=F",
    category: "agricultural",
    quoteUnit: "US¢/lb",
    isCents: true,
    perKgFactor: LB_PER_KG,
    perGramFactor: null,
    investingUrl: "https://www.investing.com/commodities/us-coffee-c",
  },
  {
    id: "gold",
    symbol: "GC=F",
    category: "metals",
    quoteUnit: "USD/oz",
    isCents: false,
    perKgFactor: null,
    perGramFactor: TROY_OZ_PER_GRAM,
    investingUrl: "https://www.investing.com/commodities/gold",
  },
  {
    id: "silver",
    symbol: "SI=F",
    category: "metals",
    quoteUnit: "USD/oz",
    isCents: false,
    perKgFactor: null,
    perGramFactor: TROY_OZ_PER_GRAM,
    investingUrl: "https://www.investing.com/commodities/silver",
  },
  {
    id: "cocoa",
    symbol: "CC=F",
    category: "agricultural",
    quoteUnit: "USD/t",
    isCents: false,
    perKgFactor: 0.001,
    perGramFactor: null,
    investingUrl: "https://www.investing.com/commodities/us-cocoas",
  },
  {
    id: "sugar",
    symbol: "SB=F",
    category: "agricultural",
    quoteUnit: "US¢/lb",
    isCents: true,
    perKgFactor: LB_PER_KG,
    perGramFactor: null,
    investingUrl: "https://www.investing.com/commodities/us-sugar-no11",
  },
  {
    id: "brent",
    symbol: "BZ=F",
    category: "energy",
    quoteUnit: "USD/bbl",
    isCents: false,
    perKgFactor: null,
    perGramFactor: null,
    investingUrl: "https://www.investing.com/commodities/brent-oil",
  },
] as const;

export function toUsdUnitPrice(spec: CommoditySpec, rawPrice: number): number {
  return spec.isCents ? rawPrice / 100 : rawPrice;
}

export function computeUsdPerKg(spec: CommoditySpec, rawPrice: number): number | null {
  if (spec.perKgFactor === null) return null;
  return Number((toUsdUnitPrice(spec, rawPrice) * spec.perKgFactor).toFixed(4));
}

export function computeUsdPerGram(spec: CommoditySpec, rawPrice: number): number | null {
  if (spec.perGramFactor === null) return null;
  return Number((toUsdUnitPrice(spec, rawPrice) * spec.perGramFactor).toFixed(4));
}

export function computeEtbEquivalent(
  usdValue: number | null,
  usdToEtbRate: number | null,
): number | null {
  if (usdValue === null || usdToEtbRate === null || !Number.isFinite(usdToEtbRate) || usdToEtbRate <= 0) {
    return null;
  }
  return Number((usdValue * usdToEtbRate).toFixed(2));
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseYahooChartResponse(
  spec: CommoditySpec,
  payload: unknown,
  usdToEtbRate: number | null = null,
): CommodityQuote | null {
  const result = (payload as any)?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return null;

  const price = asFiniteNumber(meta.regularMarketPrice);
  if (price === null || price <= 0) return null;

  const timestamps: unknown[] = Array.isArray(result.timestamp) ? result.timestamp : [];
  const closes: unknown[] = Array.isArray(result.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];

  const byDate = new Map<string, number>();
  for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
    const ts = asFiniteNumber(timestamps[i]);
    const close = asFiniteNumber(closes[i]);
    if (ts === null || close === null || close <= 0) continue;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    byDate.set(date, Number(close.toFixed(4)));
  }

  const history: CommodityHistoryPoint[] = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, close]) => ({ date, close }));

  const marketUnix = asFiniteNumber(meta.regularMarketTime);
  const marketTime = marketUnix ? new Date(marketUnix * 1000).toISOString() : null;
  const marketDate = marketTime ? marketTime.slice(0, 10) : null;

  // Determine previous trading day close accurately (avoid using 1-month-ago chartPreviousClose as daily prevClose).
  let previousClose = asFiniteNumber(meta.previousClose);
  if (previousClose === null && history.length > 0) {
    const nonToday = marketDate
      ? history.filter((pt) => pt.date < marketDate)
      : history.slice(0, -1);
    if (nonToday.length > 0) {
      previousClose = nonToday[nonToday.length - 1].close;
    } else if (history.length >= 2) {
      previousClose = history[history.length - 2].close;
    }
  }

  const metaChangePct = asFiniteNumber(meta.regularMarketChangePercent);
  const change = previousClose !== null ? Number((price - previousClose).toFixed(4)) : null;
  const changePercent =
    metaChangePct !== null
      ? Number(metaChangePct.toFixed(2))
      : previousClose && previousClose > 0
        ? Number((((price - previousClose) / previousClose) * 100).toFixed(2))
        : null;

  const monthBase = asFiniteNumber(meta.chartPreviousClose) ?? history[0]?.close ?? null;
  const monthChangePercent =
    monthBase && monthBase > 0 ? Number((((price - monthBase) / monthBase) * 100).toFixed(2)) : null;

  const usdPrice = Number(toUsdUnitPrice(spec, price).toFixed(4));
  const usdPerKg = computeUsdPerKg(spec, price);
  const usdPerGram = computeUsdPerGram(spec, price);

  return {
    id: spec.id,
    symbol: spec.symbol,
    category: spec.category,
    exchange: String(meta.fullExchangeName || meta.exchangeName || "ICE / COMEX"),
    quoteUnit: spec.quoteUnit,
    price: Number(price.toFixed(4)),
    previousClose,
    change,
    changePercent,
    monthChangePercent,
    dayLow: asFiniteNumber(meta.regularMarketDayLow),
    dayHigh: asFiniteNumber(meta.regularMarketDayHigh),
    week52Low: asFiniteNumber(meta.fiftyTwoWeekLow),
    week52High: asFiniteNumber(meta.fiftyTwoWeekHigh),
    usdPerKg,
    etbPerKg: computeEtbEquivalent(usdPerKg, usdToEtbRate),
    usdPerGram,
    etbPerGram: computeEtbEquivalent(usdPerGram, usdToEtbRate),
    usdPrice,
    etbPrice: computeEtbEquivalent(usdPrice, usdToEtbRate),
    marketTime,
    investingUrl: spec.investingUrl,
    history,
  };
}
