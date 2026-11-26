import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { SessionUser } from "../common/session-user";
import { ExchangeRateService } from "../currency/exchange-rate.service";
import {
  COMMODITY_INSTRUMENTS,
  computeEtbEquivalent,
  parseYahooChartResponse,
  type CommodityQuote,
} from "./market.utils";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const REFRESH_THROTTLE_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

interface MarketCacheFile {
  version: 1;
  fetchedAt: string | null;
  items: CommodityQuote[];
}

export interface MarketCommoditiesResponse {
  fetchedAt: string | null;
  stale: boolean;
  usdToEtbRate: number | null;
  source: string;
  items: CommodityQuote[];
}

function emptyCache(): MarketCacheFile {
  return { version: 1, fetchedAt: null, items: [] };
}

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private memory: MarketCacheFile | null = null;
  private lastRefreshAttempt = 0;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  private get cacheFile(): string {
    return (
      process.env.MARKET_CACHE_FILE ??
      path.resolve(__dirname, "../../../../data/market-cache.json")
    );
  }

  private async readCache(): Promise<MarketCacheFile> {
    if (this.memory) return this.memory;
    try {
      const raw = await readFile(this.cacheFile, "utf8");
      const parsed = JSON.parse(raw) as Partial<MarketCacheFile>;
      this.memory = {
        version: 1,
        fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : null,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      this.memory = emptyCache();
    }
    return this.memory;
  }

  private async persist(cache: MarketCacheFile): Promise<void> {
    this.memory = cache;
    const file = this.cacheFile;
    this.writeChain = this.writeChain.then(async () => {
      try {
        await mkdir(path.dirname(file), { recursive: true });
        const temp = `${file}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(cache, null, 2), "utf8");
        await rename(temp, file);
      } catch (err) {
        this.logger.warn(`Could not persist market cache: ${(err as Error).message}`);
      }
    });
    await this.writeChain;
  }

  private async getUsdToEtbRate(user: SessionUser): Promise<number | null> {
    try {
      const quote = await this.exchangeRateService.latest(user, false);
      return typeof quote?.rate === "number" && Number.isFinite(quote.rate) ? quote.rate : null;
    } catch {
      return null;
    }
  }

  private applyEtbConversions(items: CommodityQuote[], usdToEtbRate: number | null): CommodityQuote[] {
    return items.map((item) => ({
      ...item,
      etbPrice: computeEtbEquivalent(item.usdPrice, usdToEtbRate),
      etbPerKg: computeEtbEquivalent(item.usdPerKg, usdToEtbRate),
      etbPerGram: computeEtbEquivalent(item.usdPerGram, usdToEtbRate),
    }));
  }

  private async fetchInstrument(
    spec: (typeof COMMODITY_INSTRUMENTS)[number],
    usdToEtbRate: number | null,
  ): Promise<CommodityQuote | null> {
    const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(spec.symbol)}?interval=1d&range=1mo`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    return parseYahooChartResponse(spec, payload, usdToEtbRate);
  }

  async getCommodities(user: SessionUser, forceRefresh = false): Promise<MarketCommoditiesResponse> {
    const cache = await this.readCache();
    const usdToEtbRate = await this.getUsdToEtbRate(user);

    const fetchedAtMs = cache.fetchedAt ? Date.parse(cache.fetchedAt) : 0;
    const isFresh =
      cache.items.length > 0 &&
      Number.isFinite(fetchedAtMs) &&
      Date.now() - fetchedAtMs < DEFAULT_TTL_MS;

    const throttled = Date.now() - this.lastRefreshAttempt < REFRESH_THROTTLE_MS;
    if ((!forceRefresh && isFresh) || (forceRefresh && throttled && cache.items.length > 0)) {
      return {
        fetchedAt: cache.fetchedAt,
        stale: false,
        usdToEtbRate,
        source: "ICE Futures / COMEX · Investing.com Reference",
        items: this.applyEtbConversions(cache.items, usdToEtbRate),
      };
    }

    this.lastRefreshAttempt = Date.now();
    const settled = await Promise.allSettled(
      COMMODITY_INSTRUMENTS.map((spec) => this.fetchInstrument(spec, usdToEtbRate)),
    );

    const freshById = new Map<string, CommodityQuote>();
    for (const entry of settled) {
      if (entry.status === "fulfilled" && entry.value) {
        freshById.set(entry.value.id, entry.value);
      }
    }

    if (freshById.size > 0) {
      const cachedById = new Map(cache.items.map((item) => [item.id, item]));
      const merged = COMMODITY_INSTRUMENTS.map((spec) => freshById.get(spec.id) ?? cachedById.get(spec.id))
        .filter((item): item is CommodityQuote => Boolean(item));
      const nowIso = new Date().toISOString();
      await this.persist({
        version: 1,
        fetchedAt: nowIso,
        items: merged,
      });
      return {
        fetchedAt: nowIso,
        stale: freshById.size < COMMODITY_INSTRUMENTS.length,
        usdToEtbRate,
        source: "ICE Futures / COMEX · Investing.com Reference",
        items: this.applyEtbConversions(merged, usdToEtbRate),
      };
    }

    if (cache.items.length > 0) {
      return {
        fetchedAt: cache.fetchedAt,
        stale: true,
        usdToEtbRate,
        source: "ICE Futures / COMEX · Investing.com Reference",
        items: this.applyEtbConversions(cache.items, usdToEtbRate),
      };
    }

    throw new ServiceUnavailableException("Live commodity market quotes are temporarily unavailable");
  }
}
