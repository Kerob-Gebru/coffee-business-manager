"use client";

import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ExchangeRateQuote } from "@/lib/types";

export default function ExchangeRateWidget({ onOpen }: { onOpen: () => void }) {
  const { t, locale } = useTranslation();
  const [quote, setQuote] = useState<ExchangeRateQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load(force = false) {
    if (force) setRefreshing(true);
    else setLoading(true);
    setFailed(false);
    try {
      const response = await api(`/exchange-rates${force ? "?refresh=1" : ""}`);
      if (!response.ok) {
        setFailed(true);
        return;
      }
      setQuote(await response.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rate = quote?.rate ?? null;
  const updated = quote?.fetchedAt
    ? new Date(quote.fetchedAt).toLocaleString(locale)
    : "—";
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
    <section className="panel rate-widget">
      <div className="rate-widget-top">
        <div>
          <span className="eyebrow">{t("dashboard.exchangeRate")}</span>
          <p className="muted">{t("dashboard.exchangeRateDesc")}</p>
        </div>
        <span className={`badge-status ${badgeClass}`}>{badgeText}</span>
      </div>

      <div className="rate-widget-body">
        <div className="rate-widget-value">
          <strong>{loading && !quote ? "…" : rate === null ? "—" : fmtNumber(rate, locale, 4)}</strong>
          <span>ETB</span>
          <small>
            {t("exchange.oneEtb")} ={" "}
            {rate !== null && rate > 0 ? fmtNumber(1 / rate, locale, 6) : "—"} USD
          </small>
        </div>
        <div className="rate-widget-meta">
          <small>
            {t("exchange.lastUpdated")}: {updated}
          </small>
          <small>
            {t("exchange.source")}: {quote?.source ?? "—"}
          </small>
          {failed && <small className="danger-text">{t("exchange.providerOffline")}</small>}
          {quote?.stale && <small className="danger-text">{t("exchange.staleNote")}</small>}
        </div>
        <div className="rate-widget-actions">
          <button
            className="action-btn"
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            title={t("exchange.refresh")}
          >
            <RefreshCw size={13} className={refreshing ? "spin" : ""} />
            <span>{refreshing ? t("exchange.refreshing") : t("common.refresh")}</span>
          </button>
          <button className="secondary" type="button" onClick={onOpen}>
            {t("exchange.openPage")} <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <p className="form-note">{t("exchange.indicativeNote")}</p>
    </section>
  );
}
