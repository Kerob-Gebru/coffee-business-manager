"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Delete, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { fmtNumber } from "@/lib/format";
import {
  type CalcState,
  type Operator,
  initialState,
  inputDigit,
  inputDecimal,
  backspace,
  toggleSign,
  chooseOperator,
  percent,
  equals,
  loadValue,
  formatEntry,
  parseAmount,
  profitAnalysis,
  addTax,
  removeTax,
  taxAmount,
  type HistoryEntry,
} from "@/lib/calculator";
const HISTORY_KEY = "coffee_calculator_history_v1";
const DECIMALS_KEY = "coffee_calculator_decimals_v1";
const MAX_HISTORY = 50;

type KeyVariant = "digit" | "operator" | "function" | "equals";

const KEYPAD: Array<{ key: string; label: string; variant: KeyVariant }> = [
  { key: "clear", label: "C", variant: "function" },
  { key: "back", label: "⌫", variant: "function" },
  { key: "%", label: "%", variant: "function" },
  { key: "/", label: "÷", variant: "operator" },
  { key: "7", label: "7", variant: "digit" },
  { key: "8", label: "8", variant: "digit" },
  { key: "9", label: "9", variant: "digit" },
  { key: "*", label: "×", variant: "operator" },
  { key: "4", label: "4", variant: "digit" },
  { key: "5", label: "5", variant: "digit" },
  { key: "6", label: "6", variant: "digit" },
  { key: "-", label: "−", variant: "operator" },
  { key: "1", label: "1", variant: "digit" },
  { key: "2", label: "2", variant: "digit" },
  { key: "3", label: "3", variant: "digit" },
  { key: "+", label: "+", variant: "operator" },
  { key: "±", label: "±", variant: "function" },
  { key: "0", label: "0", variant: "digit" },
  { key: ".", label: ".", variant: "digit" },
  { key: "=", label: "=", variant: "equals" },
];

function readHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is HistoryEntry =>
          row &&
          typeof row.id === "string" &&
          typeof row.expression === "string" &&
          typeof row.result === "number" &&
          typeof row.at === "string",
      )
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function writeHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Storage can be unavailable; calculation still works.
  }
}

export default function CalculatorModule() {
  const { t, locale } = useTranslation();
  const [state, setState] = useState<CalcState>(initialState);
  const [decimals, setDecimals] = useState(2);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copiedKey, setCopiedKey] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const [cost, setCost] = useState("");
  const [revenue, setRevenue] = useState("");
  const [taxRate, setTaxRate] = useState("15");
  const [taxable, setTaxable] = useState("");

  useEffect(() => {
    setHistory(readHistory());
    const stored = Number(localStorage.getItem(DECIMALS_KEY));
    if ([2, 3, 4, 6].includes(stored)) setDecimals(stored);
  }, []);

  useEffect(() => {
    if (!copiedKey) return;
    const timer = setTimeout(() => setCopiedKey(""), 2000);
    return () => clearTimeout(timer);
  }, [copiedKey]);

  async function copyText(text: string, key: string) {
    setCopyFailed(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("clipboard unavailable");
      }
      setCopiedKey(key);
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(area);
        if (!ok) throw new Error("copy command rejected");
        setCopiedKey(key);
      } catch {
        setCopyFailed(true);
      }
    }
  }

  function changeDecimals(next: number) {
    setDecimals(next);
    try {
      localStorage.setItem(DECIMALS_KEY, String(next));
    } catch {
      // Ignore storage failures.
    }
  }

  function commitEquals(current: CalcState) {
    const next = equals(current, decimals);
    setState(next);
    if (next.error || !next.lastExpression) return;
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      expression: next.lastExpression,
      result: Number(next.display),
      at: new Date().toISOString(),
    };
    const updated = [entry, ...history].slice(0, MAX_HISTORY);
    setHistory(updated);
    writeHistory(updated);
  }

  const press = useCallback(
    (key: string) => {
      if (key === "clear") {
        setState(initialState());
        return;
      }
      if (key === "=") {
        commitEquals(state);
        return;
      }
      setState((prev) => {
        if (/^\d$/.test(key)) return inputDigit(prev, key, decimals);
        if (key === ".") return inputDecimal(prev);
        if (key === "back") return backspace(prev);
        if (key === "±") return toggleSign(prev);
        if (key === "%") return percent(prev, decimals);
        if (key === "+" || key === "-" || key === "*" || key === "/") {
          return chooseOperator(prev, key as Operator, decimals);
        }
        return prev;
      });
    },
    // commitEquals intentionally uses the latest render's state and history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decimals, state, history],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = event.key;
      if (/^\d$/.test(key)) {
        event.preventDefault();
        press(key);
      } else if (key === ".") {
        event.preventDefault();
        press(".");
      } else if (key === "+" || key === "-" || key === "*" || key === "/" || key === "%") {
        event.preventDefault();
        press(key);
      } else if (key === "Enter" || key === "=") {
        event.preventDefault();
        press("=");
      } else if (key === "Backspace") {
        event.preventDefault();
        press("back");
      } else if (key === "Escape") {
        event.preventDefault();
        press("clear");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press]);

  const errorText = state.error
    ? t(state.error === "divideByZero" ? "calculator.divideByZero" : "calculator.overflow")
    : "";
  const expression = state.error ? "" : state.lastExpression || state.expression;
  const displayed = state.error ? "—" : formatEntry(state.display, locale);

  const costValue = parseAmount(cost);
  const revenueValue = parseAmount(revenue);
  const taxRateValue = parseAmount(taxRate);
  const taxableValue = parseAmount(taxable);
  const negativeBusinessInput =
    [costValue, revenueValue, taxRateValue, taxableValue].some(
      (value) => value !== null && value < 0,
    );
  const invalidBusinessInput =
    negativeBusinessInput ||
    (cost.trim() !== "" && costValue === null) ||
    (revenue.trim() !== "" && revenueValue === null) ||
    (taxRate.trim() !== "" && taxRateValue === null) ||
    (taxable.trim() !== "" && taxableValue === null);

  const analysis =
    costValue !== null && revenueValue !== null && !negativeBusinessInput
      ? profitAnalysis(costValue, revenueValue)
      : null;
  const taxDue =
    taxableValue !== null && taxRateValue !== null && !negativeBusinessInput
      ? taxAmount(taxableValue, taxRateValue)
      : null;
  const withTax =
    taxableValue !== null && taxRateValue !== null && !negativeBusinessInput
      ? addTax(taxableValue, taxRateValue)
      : null;
  const withoutTax =
    taxableValue !== null && taxRateValue !== null && !negativeBusinessInput
      ? removeTax(taxableValue, taxRateValue)
      : null;

  function useValue(value: number | null) {
    if (value === null) return;
    setState(loadValue(value, decimals));
  }

  function clearHistory() {
    setHistory([]);
    writeHistory([]);
  }

  return (
    <div className="calc-layout">
      <section className="panel calc-panel">
        <div className="panel-head">
          <div>
            <h2>{t("calculator.display")}</h2>
            <p>{t("calculator.subtitle")}</p>
          </div>
          <label className="calc-decimals">
            {t("calculator.decimals")}
            <select value={decimals} onChange={(e) => changeDecimals(Number(e.target.value))}>
              {[2, 3, 4, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="calc-display">
          <div className="calc-expression">{expression || "\u00A0"}</div>
          <div className={`calc-value ${state.error ? "calc-value-error" : ""}`}>{displayed}</div>
          <div className="calc-display-actions">
            <button
              type="button"
              className="action-btn"
              onClick={() => copyText(state.display, "result")}
              title={t("calculator.copy")}
            >
              {copiedKey === "result" ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedKey === "result" ? t("calculator.copied") : t("calculator.copy")}</span>
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={() => setState(initialState())}
              title={t("calculator.clear")}
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        {errorText && <p className="error">{errorText}</p>}
        {copyFailed && <p className="error">{t("calculator.copyFailed")}</p>}

        <div className="calc-keys">
          {KEYPAD.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`calc-key calc-key-${item.variant}`}
              onClick={() => press(item.key)}
              aria-label={
                item.key === "back"
                  ? t("calculator.backspace")
                  : item.key === "clear"
                    ? t("calculator.clear")
                    : item.label
              }
            >
              {item.key === "back" ? <Delete size={18} /> : item.label}
            </button>
          ))}
        </div>

        <p className="form-note">{t("calculator.help")}</p>
      </section>

      <div className="calc-side">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("calculator.businessTools")}</h2>
              <p>{t("calculator.businessToolsDesc")}</p>
            </div>
          </div>

          <div className="calc-fields">
            <label>
              {t("calculator.cost")}
              <input
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label>
              {t("calculator.revenue")}
              <input
                inputMode="decimal"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>

          {invalidBusinessInput ? (
            <p className="error">{t("calculator.invalidBusinessInput")}</p>
          ) : analysis === null || !analysis.ok ? (
            <p className="form-note">{t("calculator.enterAmountPrompt")}</p>
          ) : (
            <div className="calc-metrics">
              <div>
                <small>{analysis.profit >= 0 ? t("calculator.profit") : t("calculator.loss")}</small>
                <strong className={analysis.profit < 0 ? "danger-text" : "positive-text"}>
                  {fmtNumber(analysis.profit, locale, decimals)}
                </strong>
                <button className="link-btn" type="button" onClick={() => useValue(analysis.profit)}>
                  {t("calculator.useResult")}
                </button>
              </div>
              <div>
                <small>{t("calculator.margin")}</small>
                <strong>
                  {analysis.marginPct === null ? "—" : `${fmtNumber(analysis.marginPct, locale, 2)}%`}
                </strong>
              </div>
              <div>
                <small>{t("calculator.markup")}</small>
                <strong>
                  {analysis.markupPct === null ? "—" : `${fmtNumber(analysis.markupPct, locale, 2)}%`}
                </strong>
              </div>
            </div>
          )}

          <div className="calc-fields calc-fields-tax">
            <label>
              {t("calculator.taxRate")}
              <input
                inputMode="decimal"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="15"
              />
            </label>
            <label>
              {t("calculator.taxableAmount")}
              <input
                inputMode="decimal"
                value={taxable}
                onChange={(e) => setTaxable(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="calc-tax-rows">
            <div>
              <small>{t("calculator.taxDue")}</small>
              <strong>{taxDue === null ? "—" : fmtNumber(taxDue, locale, decimals)}</strong>
            </div>
            <div>
              <small>{t("calculator.amountIncludingTax")}</small>
              <strong>{withTax === null ? "—" : fmtNumber(withTax, locale, decimals)}</strong>
              <button className="link-btn" type="button" onClick={() => useValue(withTax)}>
                {t("calculator.addTax")}
              </button>
            </div>
            <div>
              <small>{t("calculator.amountExcludingTax")}</small>
              <strong>{withoutTax === null ? "—" : fmtNumber(withoutTax, locale, decimals)}</strong>
              <button className="link-btn" type="button" onClick={() => useValue(withoutTax)}>
                {t("calculator.removeTax")}
              </button>
            </div>
          </div>
        </section>

        <section className="panel calc-history-panel">
          <div className="panel-head">
            <div>
              <h2>{t("calculator.history")}</h2>
              <p>{t("calculator.historyDesc")}</p>
            </div>
            {history.length > 0 && (
              <button className="text-btn" type="button" onClick={clearHistory}>
                <Trash2 size={13} /> {t("calculator.clearHistory")}
              </button>
            )}
          </div>
          <div className="calc-history-list">
            {history.map((entry) => (
              <div className="calc-history-row" key={entry.id}>
                <button
                  type="button"
                  className="calc-history-main"
                  onClick={() => setState(loadValue(entry.result, decimals))}
                  title={t("calculator.useResult")}
                >
                  <small>{entry.expression} =</small>
                  <strong>{fmtNumber(entry.result, locale, decimals)}</strong>
                </button>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => copyText(String(entry.result), entry.id)}
                  title={t("calculator.copy")}
                >
                  {copiedKey === entry.id ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            ))}
            {!history.length && <div className="empty">{t("calculator.noHistory")}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
