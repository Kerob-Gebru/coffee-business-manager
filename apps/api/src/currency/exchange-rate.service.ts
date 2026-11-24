import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, desc, eq, or } from "drizzle-orm";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { db } from "../database/client";
import { exchangeRates } from "../database/schema";
import { assertCan } from "../common/permissions";
import type { SessionUser } from "../common/session-user";
import { writeAudit } from "../common/tenant";

const PAIR = { base: "USD", quote: "ETB" } as const;
const MIN_RATE = 0.01;
const MAX_RATE = 100000;
const REFRESH_THROTTLE_MS = 10_000;
const HISTORY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
const HISTORY_SAMPLES = 12;

const DEFAULT_PRIMARY_URL =
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json";
const DEFAULT_DATED_URL =
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/v1/currencies/usd.min.json";
const DEFAULT_FALLBACK_URL = "https://open.er-api.com/v6/latest/USD";

type Snapshot = {
  rate: number;
  date: string | null;
  source: string;
  sourceUrl: string | null;
  fetchedAt: string;
  provider: string;
};

type Override = {
  rate: number;
  bankBuy: number | null;
  bankSell: number | null;
  note: string | null;
  updatedAt: string;
  updatedBy: string;
};

type CacheFile = {
  version: 1;
  latest: Snapshot | null;
  snapshots: Record<string, Snapshot>;
  overrides: Record<string, Override>;
  historyFetchedAt: string | null;
};

type HistoryPoint = { date: string; rate: number; source: string };

function emptyCache(): CacheFile {
  return { version: 1, latest: null, snapshots: {}, overrides: {}, historyFetchedAt: null };
}

function dateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_RATE && value <= MAX_RATE;
}

function parseOptionalRate(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!isValidRate(parsed)) {
    throw new BadRequestException(`${label} must be a number between ${MIN_RATE} and ${MAX_RATE}`);
  }
  return parsed;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private memory: CacheFile | null = null;
  private lastRefreshAttempt = 0;
  private writeChain: Promise<void> = Promise.resolve();

  private get cacheFile(): string {
    return (
      process.env.EXCHANGE_RATE_CACHE_FILE ??
      path.resolve(__dirname, "../../../../data/exchange-rates-cache.json")
    );
  }

  private get ttlMs(): number {
    return Number(process.env.EXCHANGE_RATE_CACHE_TTL_MS) || DEFAULT_TTL_MS;
  }

  private get timeoutMs(): number {
    return Number(process.env.EXCHANGE_RATE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  }

  private get refreshThrottleMs(): number {
    const parsed = Number(process.env.EXCHANGE_RATE_REFRESH_THROTTLE_MS);
    return Number.isFinite(parsed) ? parsed : REFRESH_THROTTLE_MS;
  }

  private get primaryUrl(): string {
    return process.env.EXCHANGE_RATE_PRIMARY_URL || DEFAULT_PRIMARY_URL;
  }

  private get datedUrlTemplate(): string {
    return process.env.EXCHANGE_RATE_DATED_URL || DEFAULT_DATED_URL;
  }

  private get fallbackUrl(): string {
    return process.env.EXCHANGE_RATE_FALLBACK_URL || DEFAULT_FALLBACK_URL;
  }

  private async readCache(): Promise<CacheFile> {
    if (this.memory) return this.memory;
    try {
      const raw = await readFile(this.cacheFile, "utf8");
      const parsed = JSON.parse(raw) as Partial<CacheFile>;
      this.memory = {
        version: 1,
        latest: parsed.latest && isValidRate(parsed.latest.rate) ? parsed.latest : null,
        snapshots: parsed.snapshots && typeof parsed.snapshots === "object" ? parsed.snapshots : {},
        overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
        historyFetchedAt: parsed.historyFetchedAt ?? null,
      };
    } catch {
      this.memory = emptyCache();
    }
    return this.memory;
  }

  private async persist(cache: CacheFile): Promise<void> {
    this.memory = cache;
    const file = this.cacheFile;
    this.writeChain = this.writeChain.then(async () => {
      try {
        await mkdir(path.dirname(file), { recursive: true });
        const temp = `${file}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(cache, null, 2), "utf8");
        await rename(temp, file);
      } catch (error) {
        this.logger.warn(`Could not persist exchange-rate cache: ${(error as Error).message}`);
      }
    });
    await this.writeChain;
  }

  private async fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    return response.json();
  }

  private async fetchPrimary(): Promise<Snapshot> {
    const url = this.primaryUrl;
    const data = (await this.fetchJson(url)) as {
      date?: string;
      usd?: Record<string, unknown>;
    };
    const rate = Number(data?.usd?.etb);
    if (!isValidRate(rate)) throw new Error("Provider returned no usable USD/ETB rate");
    return {
      rate,
      date: typeof data.date === "string" ? data.date.slice(0, 10) : dateKey(new Date()),
      source: process.env.EXCHANGE_RATE_PRIMARY_SOURCE || "currency-api (fawazahmed0) via jsDelivr",
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      provider: "currency-api",
    };
  }

  private async fetchFallback(): Promise<Snapshot> {
    const url = this.fallbackUrl;
    const data = (await this.fetchJson(url)) as {
      result?: string;
      rates?: Record<string, unknown>;
      time_last_update_unix?: number;
    };
    if (data?.result && data.result !== "success") {
      throw new Error(`Provider reported ${data.result}`);
    }
    const rate = Number(data?.rates?.ETB);
    if (!isValidRate(rate)) throw new Error("Provider returned no usable USD/ETB rate");
    return {
      rate,
      date:
        typeof data.time_last_update_unix === "number"
          ? dateKey(new Date(data.time_last_update_unix * 1000))
          : dateKey(new Date()),
      source: process.env.EXCHANGE_RATE_FALLBACK_SOURCE || "open.er-api.com",
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      provider: "open.er-api",
    };
  }

  private async fetchLatestFromProvider(): Promise<Snapshot> {
    let lastError: unknown;
    for (const attempt of [() => this.fetchPrimary(), () => this.fetchFallback()]) {
      try {
        return await attempt();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Exchange rate provider unavailable");
  }

  private async fetchDated(date: string): Promise<Snapshot | null> {
    if (!this.datedUrlTemplate.includes("{date}")) return null;
    const url = this.datedUrlTemplate.replace("{date}", date);
    try {
      const data = (await this.fetchJson(url)) as { date?: string; usd?: Record<string, unknown> };
      const rate = Number(data?.usd?.etb);
      if (!isValidRate(rate)) return null;
      return {
        rate,
        date: typeof data.date === "string" ? data.date.slice(0, 10) : date,
        source: process.env.EXCHANGE_RATE_PRIMARY_SOURCE || "currency-api (fawazahmed0) via jsDelivr",
        sourceUrl: url,
        fetchedAt: new Date().toISOString(),
        provider: "currency-api",
      };
    } catch {
      return null;
    }
  }

  private async ensureMarketSnapshot(force: boolean): Promise<{ snapshot: Snapshot; stale: boolean }> {
    const cache = await this.readCache();
    const cached = cache.latest;
    const cacheFresh =
      cached && Date.now() - new Date(cached.fetchedAt).getTime() < this.ttlMs;
    if (cached && cacheFresh && !force) return { snapshot: cached, stale: false };

    if (force && Date.now() - this.lastRefreshAttempt < this.refreshThrottleMs && cached) {
      return { snapshot: cached, stale: false };
    }
    this.lastRefreshAttempt = Date.now();

    try {
      const snapshot = await this.fetchLatestFromProvider();
      cache.latest = snapshot;
      const key = snapshot.date ?? dateKey(snapshot.fetchedAt);
      if (key) cache.snapshots[key] = snapshot;
      await this.persist(cache);
      return { snapshot, stale: false };
    } catch (error) {
      this.logger.warn(
        `Live USD/ETB rate unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (cached) return { snapshot: cached, stale: true };
      throw new ServiceUnavailableException(
        "The live USD/ETB rate is unavailable right now and no saved rate exists yet. " +
          "Try again later, or ask an authorized manager to enter a clearly labelled manual override.",
      );
    }
  }

  private present(snapshot: Snapshot | null, stale: boolean, override: Override | null) {
    const effectiveRate = override ? override.rate : snapshot?.rate ?? null;
    return {
      pair: `${PAIR.base}/${PAIR.quote}`,
      base: PAIR.base,
      quote: PAIR.quote,
      rate: effectiveRate,
      marketRate: snapshot?.rate ?? null,
      inverseRate: effectiveRate && effectiveRate > 0 ? 1 / effectiveRate : null,
      marketDate: snapshot?.date ?? null,
      source: override ? "Manual override" : snapshot?.source ?? null,
      sourceUrl: override ? null : snapshot?.sourceUrl ?? null,
      provider: override ? "manual" : snapshot?.provider ?? null,
      fetchedAt: snapshot?.fetchedAt ?? null,
      stale,
      offline: stale,
      indicative: true,
      manual: Boolean(override),
      bankBuy: override?.bankBuy ?? null,
      bankSell: override?.bankSell ?? null,
      bankRatesSource: override && (override.bankBuy || override.bankSell) ? "manual" : null,
      override: override
        ? {
            rate: override.rate,
            bankBuy: override.bankBuy,
            bankSell: override.bankSell,
            note: override.note,
            updatedAt: override.updatedAt,
            updatedBy: override.updatedBy,
          }
        : null,
    };
  }

  async latest(user: SessionUser, force = false) {
    assertCan(user, "currency.view");
    const cache = await this.readCache();
    const override = cache.overrides[String(user.companyId)] ?? null;
    try {
      const { snapshot, stale } = await this.ensureMarketSnapshot(force);
      return this.present(snapshot, stale, override);
    } catch (error) {
      if (override) return this.present(cache.latest, true, override);
      throw error;
    }
  }

  async history(user: SessionUser, daysParam: string, refresh: boolean) {
    assertCan(user, "currency.view");
    const days = Math.min(Math.max(Number(daysParam) || 30, 2), 90);
    const cache = await this.readCache();
    const points = new Map<string, HistoryPoint>();

    const rows = await db
      .select({
        rate: exchangeRates.rate,
        effectiveDate: exchangeRates.effectiveDate,
        fromCurrency: exchangeRates.fromCurrency,
        toCurrency: exchangeRates.toCurrency,
      })
      .from(exchangeRates)
      .where(
        or(
          and(eq(exchangeRates.fromCurrency, PAIR.base), eq(exchangeRates.toCurrency, PAIR.quote)),
          and(eq(exchangeRates.fromCurrency, PAIR.quote), eq(exchangeRates.toCurrency, PAIR.base)),
        ),
      )
      .orderBy(desc(exchangeRates.effectiveDate))
      .limit(500);

    for (const row of rows) {
      const key = dateKey(row.effectiveDate);
      if (!key || points.has(key)) continue;
      const raw = Number(row.rate);
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const rate =
        row.fromCurrency === PAIR.base && row.toCurrency === PAIR.quote ? raw : 1 / raw;
      if (!isValidRate(rate)) continue;
      points.set(key, { date: key, rate, source: "Saved rate (database)" });
    }

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    for (const [key, snapshot] of Object.entries(cache.snapshots)) {
      if (new Date(`${key}T00:00:00Z`).getTime() < cutoff) continue;
      points.set(key, { date: key, rate: snapshot.rate, source: snapshot.source });
    }

    const historyStale =
      !cache.historyFetchedAt ||
      Date.now() - new Date(cache.historyFetchedAt).getTime() > HISTORY_MAX_AGE_MS;
    if (refresh || (historyStale && points.size < 2)) {
      const dates = new Set<string>();
      const step = Math.max(1, Math.round(days / HISTORY_SAMPLES));
      for (let offset = 1; offset <= days; offset += step) {
        const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        dates.add(date);
      }
      const fetched = await Promise.all([...dates].map((date) => this.fetchDated(date)));
      for (const snapshot of fetched) {
        if (!snapshot) continue;
        const key = snapshot.date ?? dateKey(snapshot.fetchedAt);
        if (!key) continue;
        cache.snapshots[key] = snapshot;
        if (new Date(`${key}T00:00:00Z`).getTime() >= cutoff) {
          points.set(key, { date: key, rate: snapshot.rate, source: snapshot.source });
        }
      }
      cache.historyFetchedAt = new Date().toISOString();
      await this.persist(cache);
    }

    const ordered = [...points.values()]
      .filter((point) => new Date(`${point.date}T00:00:00Z`).getTime() >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      pair: `${PAIR.base}/${PAIR.quote}`,
      base: PAIR.base,
      quote: PAIR.quote,
      days,
      indicative: true,
      fetchedAt: cache.historyFetchedAt,
      points: ordered,
    };
  }

  async getOverride(user: SessionUser) {
    assertCan(user, "currency.view");
    const cache = await this.readCache();
    return { override: cache.overrides[String(user.companyId)] ?? null };
  }

  async setOverride(user: SessionUser, body: unknown) {
    assertCan(user, "currency.override");
    const input = (body ?? {}) as Record<string, unknown>;

    const rate = parseOptionalRate(input.rate, "Override rate");
    if (rate === null) throw new BadRequestException("Enter the USD/ETB rate to override");
    const bankBuy = parseOptionalRate(input.bankBuy, "Bank buying rate");
    const bankSell = parseOptionalRate(input.bankSell, "Bank selling rate");
    if (bankBuy !== null && bankSell !== null && bankBuy > bankSell) {
      throw new BadRequestException("Bank buying rate cannot be higher than the selling rate");
    }
    const note =
      typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 300) : null;

    const cache = await this.readCache();
    const before = cache.overrides[String(user.companyId)] ?? null;
    const override: Override = {
      rate,
      bankBuy,
      bankSell,
      note,
      updatedAt: new Date().toISOString(),
      updatedBy: user.fullName,
    };
    cache.overrides[String(user.companyId)] = override;
    await this.persist(cache);

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "currency.override_set",
      entityType: "exchange_rate",
      entityId: `${PAIR.base}/${PAIR.quote}`,
      beforeData: before,
      afterData: override,
      reason: "Manual USD/ETB rate override",
    });

    return this.present(cache.latest, !cache.latest, override);
  }

  async clearOverride(user: SessionUser) {
    assertCan(user, "currency.override");
    const cache = await this.readCache();
    const key = String(user.companyId);
    const before = cache.overrides[key] ?? null;
    if (!before) return { ok: true, override: null };

    delete cache.overrides[key];
    await this.persist(cache);

    await writeAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "currency.override_removed",
      entityType: "exchange_rate",
      entityId: `${PAIR.base}/${PAIR.quote}`,
      beforeData: before,
      reason: "Manual USD/ETB rate override removed",
    });

    return this.present(cache.latest, !cache.latest, null);
  }
}
