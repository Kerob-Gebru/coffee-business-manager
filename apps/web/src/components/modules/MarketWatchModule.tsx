"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Info,
  RefreshCw,
  TrendingUp,
  WifiOff,
} from "lucide-react";
import { api, apiError } from "@/lib/api";
import { parseAmount } from "@/lib/calculator";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n";
import { estimateCommodityValue, filterCommoditiesByCategory } from "@/lib/market";
import type {
  CommodityCategory,
  CommodityHistoryPoint,
  CommodityQuote,
  MarketCommoditiesResponse,
} from "@/lib/types";

type CategoryFilter = "all" | CommodityCategory;

function fmtDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale);
}

function fmtMarketNumber(value: number, locale: string, decimals = 2): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function getCommodityCopyKeys(id: string): {
  nameKey: TranslationKey;
  descKey: TranslationKey;
} {
  switch (id) {
    case "coffee":
      return { nameKey: "market.coffeeName", descKey: "market.coffeeDesc" };
    case "gold":
      return { nameKey: "market.goldName", descKey: "market.goldDesc" };
    case "silver":
      return { nameKey: "market.silverName", descKey: "market.silverDesc" };
    case "cocoa":
      return { nameKey: "market.cocoaName", descKey: "market.cocoaDesc" };
    case "sugar":
      return { nameKey: "market.sugarName", descKey: "market.sugarDesc" };
    case "brent":
    default:
      return { nameKey: "market.brentName", descKey: "market.brentDesc" };
  }
}

function CommodityTrendChart({
  points,
  quoteUnit,
  locale,
  label,
}: {
  points: CommodityHistoryPoint[];
  quoteUnit: string;
  locale: string;
  label: string;
}) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const width = 640;
  const height = 160;
  const pad = 14;
  const coords = points.map((point, index) => {
    const x = pad + (index * (width - pad * 2)) / (points.length - 1);
    const y = height - pad - ((point.close - min) / span) * (height - pad * 2);
    return { x, y };
  });
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const isUp = values[values.length - 1] >= values[0];

  return (
    <div className="trend-wrap">
      <div className="trend-label">
        <span>{label}</span>
        <small>
          {fmtMarketNumber(min, locale, 2)} – {fmtMarketNumber(max, locale, 2)} {quoteUnit}
        </small>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" role="img" aria-label={label}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="trend-axis" />
        <polyline
          points={line}
          className={`trend-line ${isUp ? "market-line-up" : "market-line-down"}`}
        />
        {coords.map((point, index) => (
          <circle
            key={points[index].date}
            cx={point.x}
            cy={point.y}
            r="2.4"
            className={`trend-dot ${isUp ? "market-dot-up" : "market-dot-down"}`}
          />
        ))}
      </svg>
    </div>
  );
}

export default function MarketWatchModule({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<MarketCommoditiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string>("coffee");
  const [quantity, setQuantity] = useState<string>("100");

  async function load(force = false) {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await api(`/market/commodities${force ? "?refresh=1" : ""}`);
      if (response.ok) {
        const payload: MarketCommoditiesResponse = await response.json();
        setData(payload);
        if (force) {
          onNotice(`${t("market.title")} · ${t("common.refresh")}`);
        }
      } else {
        setError(await apiError(response, t("market.unavailable")));
      }
    } catch {
      setError(t("market.unavailable"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(() => data?.items ?? [], [data]);
  const filteredItems = useMemo(
    () => filterCommoditiesByCategory(items, category),
    [items, category],
  );

  const selected: CommodityQuote | null = useMemo(() => {
    if (!filteredItems.length) return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
    return filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0];
  }, [filteredItems, items, selectedId]);

  const parsedQty = useMemo(() => parseAmount(quantity), [quantity]);
  const valuation = useMemo(() => {
    if (!selected) return null;
    return estimateCommodityValue(selected, parsedQty, data?.usdToEtbRate ?? null);
  }, [selected, parsedQty, data?.usdToEtbRate]);

  const categories: Array<{ id: CategoryFilter; label: string }> = [
    { id: "all", label: t("market.all") },
    { id: "agricultural", label: t("market.agricultural") },
    { id: "metals", label: t("market.metals") },
    { id: "energy", label: t("market.energy") },
  ];

  function renderUnitConversion(item: CommodityQuote) {
    if (item.usdPerKg !== null) {
      return (
        <div className="market-card-sub">
          <span>
            {t("market.perKg")}: <b>${fmtMarketNumber(item.usdPerKg, locale, 2)}</b>
          </span>
          {item.etbPerKg !== null && (
            <span>
              {fmtMarketNumber(item.etbPerKg, locale, 2)} ETB/kg
            </span>
          )}
        </div>
      );
    }
    if (item.usdPerGram !== null) {
      return (
        <div className="market-card-sub">
          <span>
            {t("market.perGram")}: <b>${fmtMarketNumber(item.usdPerGram, locale, 2)}</b>
          </span>
          {item.etbPerGram !== null && (
            <span>
              {fmtMarketNumber(item.etbPerGram, locale, 2)} ETB/g
            </span>
          )}
        </div>
      );
    }
    return (
      <div className="market-card-sub">
        <span>
          {t("market.perBbl")}: <b>${fmtMarketNumber(item.usdPrice, locale, 2)}</b>
        </span>
        {item.etbPrice !== null && (
          <span>
            {fmtMarketNumber(item.etbPrice, locale, 2)} ETB/bbl
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="market-stack">
      <section className="panel">
        <div className="panel-head vehicle-panel-head">
          <div>
            <h2>{t("market.title")}</h2>
            <p>{t("market.subtitle")}</p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => load(true)}
            disabled={refreshing || loading}
          >
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            {refreshing ? t("market.refreshing") : t("market.refresh")}
          </button>
        </div>

        <div className="market-toolbar">
          <div className="filter-tabs" role="tablist" aria-label={t("market.title")}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={category === cat.id}
                className={`filter-tab ${category === cat.id ? "active" : ""}`}
                onClick={() => setCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="market-toolbar-meta">
            {data?.usdToEtbRate != null && (
              <span>
                {t("market.usdEtbRateUsed")}:{" "}
                <b>1 USD = {fmtMarketNumber(data.usdToEtbRate, locale, 2)} ETB</b>
              </span>
            )}
            {data?.fetchedAt && (
              <span>
                {t("market.lastUpdated")}: <b>{fmtDateTime(data.fetchedAt, locale)}</b>
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="exchange-alert">
            <WifiOff size={16} />
            <span>{error}</span>
          </div>
        )}

        {data?.stale && (
          <p className="form-note exchange-warning" style={{ marginBottom: 12 }}>
            <Info size={13} /> {t("market.staleNote")}
          </p>
        )}

        {loading && !items.length ? (
          <div className="empty">{t("common.loading")}</div>
        ) : !filteredItems.length ? (
          <div className="empty">{t("market.noItemsInCategory")}</div>
        ) : (
          <div className="market-cards-grid">
            {filteredItems.map((item) => {
              const copy = getCommodityCopyKeys(item.id);
              const isSelected = selected?.id === item.id;
              const pct = item.changePercent;
              const isUp = pct === null ? true : pct >= 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`market-card ${isSelected ? "active" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                  aria-pressed={isSelected}
                >
                  <div className="market-card-top">
                    <div className="market-card-title">
                      <strong>{t(copy.nameKey)}</strong>
                      <small>
                        {item.symbol} · {item.exchange}
                      </small>
                    </div>
                    {pct !== null && (
                      <span className={`market-delta ${isUp ? "up" : "down"}`}>
                        {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        {isUp ? "+" : ""}
                        {fmtMarketNumber(pct, locale, 2)}%
                      </span>
                    )}
                  </div>

                  <div className="market-card-price">
                    <strong>{fmtMarketNumber(item.price, locale, 2)}</strong>
                    <small>{item.quoteUnit}</small>
                  </div>

                  {renderUnitConversion(item)}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected && (
        <div className="market-detail-layout">
          <section className="panel">
            <div className="market-detail-head">
              <div>
                <span className="eyebrow">
                  {selected.symbol} · {selected.exchange}
                </span>
                <h2>{t(getCommodityCopyKeys(selected.id).nameKey)}</h2>
                <p className="muted">{t(getCommodityCopyKeys(selected.id).descKey)}</p>
              </div>
              <a
                className="secondary market-ext-link"
                href={selected.investingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <TrendingUp size={15} />
                <span>{t("market.investingRef")}</span>
                <ExternalLink size={13} />
              </a>
            </div>

            <div className="rate-hero">
              <div>
                <span className="eyebrow">{selected.quoteUnit}</span>
                <strong className="rate-hero-value">
                  {fmtMarketNumber(selected.price, locale, 2)}{" "}
                  <small>{selected.quoteUnit}</small>
                </strong>
                <span className="muted">
                  {selected.usdPerKg !== null && (
                    <>
                      1 kg = <b>${fmtMarketNumber(selected.usdPerKg, locale, 2)}</b>
                      {selected.etbPerKg !== null &&
                        ` (${fmtMarketNumber(selected.etbPerKg, locale, 2)} ETB)`}
                    </>
                  )}
                  {selected.usdPerGram !== null && (
                    <>
                      1 g = <b>${fmtMarketNumber(selected.usdPerGram, locale, 2)}</b>
                      {selected.etbPerGram !== null &&
                        ` (${fmtMarketNumber(selected.etbPerGram, locale, 2)} ETB)`}
                    </>
                  )}
                  {selected.usdPerKg === null && selected.usdPerGram === null && (
                    <>
                      1 bbl = <b>${fmtMarketNumber(selected.usdPrice, locale, 2)}</b>
                      {selected.etbPrice !== null &&
                        ` (${fmtMarketNumber(selected.etbPrice, locale, 2)} ETB)`}
                    </>
                  )}
                </span>
              </div>

              <div className="market-hero-deltas">
                {selected.changePercent !== null && (
                  <div className={`market-delta-box ${selected.changePercent >= 0 ? "up" : "down"}`}>
                    <small>{t("market.dailyChange")}</small>
                    <strong>
                      {selected.changePercent >= 0 ? "+" : ""}
                      {fmtMarketNumber(selected.changePercent, locale, 2)}%
                    </strong>
                  </div>
                )}
                {selected.monthChangePercent !== null && (
                  <div className={`market-delta-box ${selected.monthChangePercent >= 0 ? "up" : "down"}`}>
                    <small>{t("market.monthChange")}</small>
                    <strong>
                      {selected.monthChangePercent >= 0 ? "+" : ""}
                      {fmtMarketNumber(selected.monthChangePercent, locale, 2)}%
                    </strong>
                  </div>
                )}
              </div>
            </div>

            <CommodityTrendChart
              points={selected.history}
              quoteUnit={selected.quoteUnit}
              locale={locale}
              label={t("market.trend30d")}
            />

            <div className="market-stats-grid">
              <div>
                <small>{t("market.dayRange")}</small>
                <strong>
                  {selected.dayLow != null && selected.dayHigh != null
                    ? `${fmtMarketNumber(selected.dayLow, locale, 2)} – ${fmtMarketNumber(selected.dayHigh, locale, 2)}`
                    : "—"}
                </strong>
              </div>
              <div>
                <small>{t("market.week52Range")}</small>
                <strong>
                  {selected.week52Low != null && selected.week52High != null
                    ? `${fmtMarketNumber(selected.week52Low, locale, 2)} – ${fmtMarketNumber(selected.week52High, locale, 2)}`
                    : "—"}
                </strong>
              </div>
              <div>
                <small>{t("market.prevClose")}</small>
                <strong>
                  {selected.previousClose != null
                    ? `${fmtMarketNumber(selected.previousClose, locale, 2)} ${selected.quoteUnit}`
                    : "—"}
                </strong>
              </div>
              <div>
                <small>{t("market.exchangeLabel")}</small>
                <strong>{selected.exchange}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>{t("market.estimatorTitle")}</h2>
                <p>{t("market.estimatorDesc")}</p>
              </div>
            </div>

            <div className="market-estimator-form">
              <label>
                {t("market.quantity")} (
                {selected.usdPerKg !== null
                  ? "kg"
                  : selected.usdPerGram !== null
                    ? "g"
                    : "bbl"}
                )
                <input
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  aria-label={t("market.quantity")}
                />
              </label>

              {quantity.trim() !== "" && parsedQty === null && (
                <p className="error">{t("calculator.invalidBusinessInput")}</p>
              )}

              <div className="market-estimator-results">
                <div>
                  <small>{t("market.estimatedUsd")}</small>
                  <strong>
                    {valuation ? `$${fmtMarketNumber(valuation.totalUsd, locale, 2)}` : "—"}
                  </strong>
                  {valuation && (
                    <span>
                      @ ${fmtMarketNumber(valuation.unitUsd, locale, 2)} / {valuation.unitLabel}
                    </span>
                  )}
                </div>
                <div>
                  <small>{t("market.estimatedEtb")}</small>
                  <strong>
                    {valuation && valuation.totalEtb !== null
                      ? `${fmtMarketNumber(valuation.totalEtb, locale, 2)} ETB`
                      : "—"}
                  </strong>
                  {valuation && valuation.unitEtb !== null && (
                    <span>
                      @ {fmtMarketNumber(valuation.unitEtb, locale, 2)} ETB / {valuation.unitLabel}
                    </span>
                  )}
                </div>
              </div>

              <p className="form-note">
                <Info size={13} /> {data?.source || "ICE Futures / COMEX · Investing.com Reference"}
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
