"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  Check,
  Copy,
  Info,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { parseAmount } from "@/lib/calculator";
import type {
  ExchangeHistory,
  ExchangeHistoryPoint,
  ExchangeRateQuote,
} from "@/lib/types";

type Direction = "usdToEtb" | "etbToUsd";

function fmtDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale);
}

function fmtHistoryDate(value: string, locale: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale);
}

function TrendChart({
  points,
  locale,
  label,
}: {
  points: ExchangeHistoryPoint[];
  locale: string;
  label: string;
}) {
  if (points.length < 2) return null;
  const rates = points.map((point) => point.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const span = max - min || Math.abs(max) || 1;
  const width = 640;
  const height = 150;
  const pad = 14;
  const coords = points.map((point, index) => {
    const x = pad + (index * (width - pad * 2)) / (points.length - 1);
    const y = height - pad - ((point.rate - min) / span) * (height - pad * 2);
    return { x, y };
  });
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  return (
    <div className="trend-wrap">
      <div className="trend-label">
        <span>{label}</span>
        <small>
          {fmtNumber(min, locale, 4)} – {fmtNumber(max, locale, 4)} ETB
        </small>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" role="img" aria-label={label}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="trend-axis" />
        <polyline points={line} className="trend-line" />
        {coords.map((point, index) => (
          <circle key={points[index].date} cx={point.x} cy={point.y} r="2.5" className="trend-dot" />
        ))}
      </svg>
    </div>
  );
}

export default function ExchangeRateModule({
  canOverride,
  onNotice,
}: {
  canOverride: boolean;
  onNotice: (message: string) => void;
}) {
  const { t, locale } = useTranslation();
  const [quote, setQuote] = useState<ExchangeRateQuote | null>(null);
  const [history, setHistory] = useState<ExchangeHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [amount, setAmount] = useState("100");
  const [direction, setDirection] = useState<Direction>("usdToEtb");
  const [copied, setCopied] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideRate, setOverrideRate] = useState("");
  const [overrideBuy, setOverrideBuy] = useState("");
  const [overrideSell, setOverrideSell] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideError, setOverrideError] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  async function load(force = false) {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const latestRes = await api(`/exchange-rates${force ? "?refresh=1" : ""}`);
      if (latestRes.ok) {
        setQuote(await latestRes.json());
      } else {
        setError(await apiError(latestRes, t("exchange.unavailable")));
      }

      setHistoryError("");
      const historyRes = await api(
        `/exchange-rates/history?days=30${force ? "&refresh=1" : ""}`,
      );
      if (historyRes.ok) {
        const data: ExchangeHistory = await historyRes.json();
        setHistory(Array.isArray(data.points) ? data.points : []);
      } else {
        setHistoryError(await apiError(historyRes, t("common.error")));
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const rate = quote?.rate ?? null;
  const amountValue = parseAmount(amount);
  const converted =
    rate !== null && rate > 0 && amountValue !== null
      ? direction === "usdToEtb"
        ? amountValue * rate
        : amountValue / rate
      : null;
  const fromCode = direction === "usdToEtb" ? "USD" : "ETB";
  const toCode = direction === "usdToEtb" ? "ETB" : "USD";

  const changePct = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0].rate;
    const last = history[history.length - 1].rate;
    if (!first) return null;
    return ((last - first) / first) * 100;
  }, [history]);

  const historyRows = useMemo(() => {
    const rows = [...history].reverse().slice(0, 15);
    return rows.map((point) => {
      const index = history.findIndex((row) => row.date === point.date);
      const previous = index > 0 ? history[index - 1].rate : null;
      const change = previous ? ((point.rate - previous) / previous) * 100 : null;
      return { ...point, change };
    });
  }, [history]);

  function swap() {
    if (converted !== null) setAmount(String(Number(converted.toFixed(4))));
    setDirection((current) => (current === "usdToEtb" ? "etbToUsd" : "usdToEtb"));
  }

  async function copyRate() {
    if (rate === null) return;
    try {
      await navigator.clipboard.writeText(String(rate));
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the rate stays visible.
    }
  }

  function openOverrideForm() {
    setOverrideRate(
      quote?.override?.rate != null
        ? String(quote.override.rate)
        : quote?.marketRate != null
          ? String(quote.marketRate)
          : "",
    );
    setOverrideBuy(quote?.override?.bankBuy != null ? String(quote.override.bankBuy) : "");
    setOverrideSell(quote?.override?.bankSell != null ? String(quote.override.bankSell) : "");
    setOverrideNote(quote?.override?.note ?? "");
    setOverrideError("");
    setShowOverride(true);
  }

  async function saveOverride(event: React.FormEvent) {
    event.preventDefault();
    setSavingOverride(true);
    setOverrideError("");
    try {
      const response = await api("/exchange-rates/override", {
        method: "PUT",
        body: JSON.stringify({
          rate: overrideRate.trim(),
          bankBuy: overrideBuy.trim() || undefined,
          bankSell: overrideSell.trim() || undefined,
          note: overrideNote.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setOverrideError(await apiError(response, t("common.error")));
        return;
      }
      setQuote(await response.json());
      setShowOverride(false);
      onNotice(t("exchange.overrideSaved"));
    } catch {
      setOverrideError(t("common.error"));
    } finally {
      setSavingOverride(false);
    }
  }

  async function removeOverride() {
    setSavingOverride(true);
    setOverrideError("");
    try {
      const response = await api("/exchange-rates/override", { method: "DELETE" });
      if (!response.ok) {
        setOverrideError(await apiError(response, t("common.error")));
        return;
      }
      setQuote(await response.json());
      setShowOverride(false);
      onNotice(t("exchange.overrideRemoved"));
    } catch {
      setOverrideError(t("common.error"));
    } finally {
      setSavingOverride(false);
    }
  }

  const badgeClass = quote?.manual
    ? "status-maintenance"
    : quote?.stale
      ? "status-draft"
      : "status-sent";
  const badgeText = quote?.manual
    ? t("exchange.overrideActive")
    : quote?.stale
      ? t("exchange.stale")
      : t("exchange.indicative");

  return (
    <>
      <div className="exchange-layout">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("exchange.title")}</h2>
              <p>{t("exchange.subtitle")}</p>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => load(true)}
              disabled={refreshing || loading}
            >
              <RefreshCw size={15} className={refreshing ? "spin" : ""} />
              {refreshing ? t("exchange.refreshing") : t("exchange.refresh")}
            </button>
          </div>

          {loading && !quote ? (
            <div className="empty">{t("common.loading")}</div>
          ) : (
            <>
              {error && (
                <div className="exchange-alert">
                  <WifiOff size={16} />
                  <span>{error}</span>
                </div>
              )}
              {!quote && !error && (
                <div className="empty">
                  {t("exchange.unavailable")} — {t("exchange.noCachedRate")}
                </div>
              )}

              <div className="rate-hero">
                <div>
                  <span className="eyebrow">{t("exchange.oneUsd")}</span>
                  <strong className="rate-hero-value">
                    {rate === null ? "—" : fmtNumber(rate, locale, 4)}
                    <small> ETB</small>
                  </strong>
                  <span className="muted">
                    {t("exchange.oneEtb")} ={" "}
                    {rate !== null && rate > 0 ? fmtNumber(1 / rate, locale, 6) : "—"} USD
                  </span>
                </div>
                <div className="rate-hero-side">
                  <span className={`badge-status ${badgeClass}`}>{badgeText}</span>
                  {rate !== null && (
                    <button className="action-btn" type="button" onClick={copyRate}>
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copied ? t("exchange.copied") : t("exchange.copyRate")}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="rate-meta">
                <div>
                  <small>{t("exchange.lastUpdated")}</small>
                  <strong>{fmtDateTime(quote?.fetchedAt, locale)}</strong>
                </div>
                <div>
                  <small>{t("exchange.source")}</small>
                  <strong>
                    {quote?.source ?? "—"}
                    {quote?.sourceUrl && (
                      <>
                        {" "}
                        <a
                          className="source-link"
                          href={quote.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("exchange.fetchedFrom")} ↗
                        </a>
                      </>
                    )}
                  </strong>
                </div>
                {quote?.marketDate && (
                  <div>
                    <small>{t("exchange.marketRate")}</small>
                    <strong>
                      {quote.marketRate === null
                        ? "—"
                        : `${fmtNumber(quote.marketRate, locale, 4)} ETB`}
                      {quote.marketDate ? ` · ${quote.marketDate}` : ""}
                    </strong>
                  </div>
                )}
              </div>

              {quote?.manual && quote.override && (
                <p className="form-note">
                  <ShieldCheck size={13} />{" "}
                  {t("exchange.overrideBy", {
                    name: quote.override.updatedBy,
                    date: fmtDateTime(quote.override.updatedAt, locale),
                  })}
                  {quote.override.note ? ` — ${quote.override.note}` : ""}
                </p>
              )}
              {quote?.stale && (
                <p className="form-note exchange-warning">
                  <Info size={13} /> {t("exchange.staleNote")}
                </p>
              )}
              <p className="form-note">
                <Info size={13} /> {t("exchange.indicativeNote")}
              </p>

              <div className="exchange-converter">
                <div className="panel-head">
                  <div>
                    <h2>{t("exchange.converter")}</h2>
                    <p>{t("exchange.converterDesc")}</p>
                  </div>
                </div>
                <div className="converter-row">
                  <label className="converter-field">
                    <span>{t("exchange.amount")}</span>
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      aria-label={t("exchange.amount")}
                    />
                    <small>
                      {fromCode} ·{" "}
                      {direction === "usdToEtb" ? t("exchange.usd") : t("exchange.etb")}
                    </small>
                  </label>

                  <button
                    type="button"
                    className="icon-btn swap-btn"
                    onClick={swap}
                    title={t("exchange.swap")}
                    aria-label={t("exchange.swap")}
                  >
                    <ArrowDownUp size={17} />
                  </button>

                  <div className="converter-field converter-output">
                    <span>{t("exchange.result")}</span>
                    <strong>{converted === null ? "—" : fmtNumber(converted, locale, 2)}</strong>
                    <small>
                      {toCode} ·{" "}
                      {direction === "usdToEtb" ? t("exchange.etb") : t("exchange.usd")}
                    </small>
                  </div>
                </div>
                {amount.trim() !== "" && amountValue === null && (
                  <p className="error">{t("calculator.invalidBusinessInput")}</p>
                )}
                <p className="form-note">
                  {t("exchange.rateUsed")}: 1 USD ={" "}
                  {rate === null ? "—" : fmtNumber(rate, locale, 4)} ETB
                </p>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("exchange.bankRates")}</h2>
              <p>{t("exchange.bankRatesDesc")}</p>
            </div>
          </div>
          <div className="bank-grid">
            <div>
              <small>{t("exchange.bankBuy")}</small>
              <strong>
                {quote?.bankBuy != null
                  ? `${fmtNumber(quote.bankBuy, locale, 4)} ETB`
                  : t("exchange.sourceNotPublished")}
              </strong>
            </div>
            <div>
              <small>{t("exchange.bankSell")}</small>
              <strong>
                {quote?.bankSell != null
                  ? `${fmtNumber(quote.bankSell, locale, 4)} ETB`
                  : t("exchange.sourceNotPublished")}
              </strong>
            </div>
          </div>
          <p className="form-note">
            {quote?.bankRatesSource === "manual"
              ? t("exchange.manualBankNote")
              : t("exchange.bankUnavailable")}
          </p>

          <div className="override-block">
            <div className="panel-head">
              <div>
                <h2>{t("exchange.manualOverride")}</h2>
                <p>{t("exchange.manualOverrideDesc")}</p>
              </div>
            </div>

            {!canOverride ? (
              <p className="form-note">{t("exchange.overrideDenied")}</p>
            ) : showOverride ? (
              <form className="override-form" onSubmit={saveOverride}>
                <label>
                  {t("exchange.overrideRate")}
                  <input
                    required
                    inputMode="decimal"
                    value={overrideRate}
                    onChange={(e) => setOverrideRate(e.target.value)}
                  />
                </label>
                <div className="calc-fields">
                  <label>
                    {t("exchange.overrideBuy")} <small>{t("common.optional")}</small>
                    <input
                      inputMode="decimal"
                      value={overrideBuy}
                      onChange={(e) => setOverrideBuy(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("exchange.overrideSell")} <small>{t("common.optional")}</small>
                    <input
                      inputMode="decimal"
                      value={overrideSell}
                      onChange={(e) => setOverrideSell(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  {t("exchange.overrideNote")} <small>{t("common.optional")}</small>
                  <input
                    maxLength={300}
                    value={overrideNote}
                    onChange={(e) => setOverrideNote(e.target.value)}
                  />
                </label>
                {overrideError && <p className="error">{overrideError}</p>}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowOverride(false)}
                    disabled={savingOverride}
                  >
                    {t("common.cancel")}
                  </button>
                  <button className="primary" disabled={savingOverride}>
                    {savingOverride ? t("common.loading") : t("exchange.saveOverride")}
                  </button>
                </div>
              </form>
            ) : (
              <div className="override-actions">
                <button className="secondary" type="button" onClick={openOverrideForm}>
                  <ShieldCheck size={15} />
                  {quote?.override ? t("exchange.overrideActive") : t("exchange.manualOverride")}
                </button>
                {quote?.override && (
                  <button
                    className="action-btn danger"
                    type="button"
                    onClick={removeOverride}
                    disabled={savingOverride}
                  >
                    {t("exchange.removeOverride")}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="panel exchange-history">
        <div className="panel-head">
          <div>
            <h2>{t("exchange.history")}</h2>
            <p>{t("exchange.historyDesc")}</p>
          </div>
          <div className="history-actions">
            {changePct !== null && (
              <span className={`badge-status ${changePct >= 0 ? "status-active" : "status-cancelled"}`}>
                {t("exchange.change")}: {changePct >= 0 ? "+" : ""}
                {fmtNumber(changePct, locale, 2)}%
              </span>
            )}
            <button
              className="action-btn"
              type="button"
              onClick={() => load(true)}
              disabled={refreshing}
            >
              <RefreshCw size={13} className={refreshing ? "spin" : ""} />
              <span>{t("exchange.historyRefresh")}</span>
            </button>
          </div>
        </div>

        {historyError && <p className="error">{historyError}</p>}
        {loading && !history.length ? (
          <div className="empty">{t("exchange.loadingHistory")}</div>
        ) : history.length ? (
          <>
            <TrendChart points={history} locale={locale} label={t("exchange.trend")} />
            <div className="table-wrap exchange-history-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th className="right">{t("exchange.rate")}</th>
                    <th className="right">{t("exchange.change")}</th>
                    <th>{t("exchange.source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => (
                    <tr key={row.date}>
                      <td>{fmtHistoryDate(row.date, locale)}</td>
                      <td className="right amount">{fmtNumber(row.rate, locale, 4)}</td>
                      <td className={`right ${row.change !== null && row.change < 0 ? "danger-text" : ""}`}>
                        {row.change === null
                          ? "—"
                          : `${row.change >= 0 ? "+" : ""}${fmtNumber(row.change, locale, 2)}%`}
                      </td>
                      <td>{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="form-note">{t("exchange.indicativeNote")}</p>
          </>
        ) : (
          <div className="empty">{t("exchange.historyEmpty")}</div>
        )}
      </section>
    </>
  );
}
