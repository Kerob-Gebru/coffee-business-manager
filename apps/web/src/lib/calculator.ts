export type Operator = "+" | "-" | "*" | "/";

export type CalcError = "divideByZero" | "overflow";

export type CalcState = {
  display: string;
  accumulator: number | null;
  operator: Operator | null;
  waitingForOperand: boolean;
  expression: string;
  lastExpression: string;
  percentLabel: string | null;
  error: CalcError | null;
};

export type HistoryEntry = {
  id: string;
  expression: string;
  result: number;
  at: string;
};

const MAX_DIGITS = 16;
const PRECISION = 12;

export const OPERATOR_SYMBOLS: Record<Operator, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
};

export function initialState(): CalcState {
  return {
    display: "0",
    accumulator: null,
    operator: null,
    waitingForOperand: false,
    expression: "",
    lastExpression: "",
    percentLabel: null,
    error: null,
  };
}

export function roundTo(value: number, decimals = PRECISION): number {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(decimals));
}

function entryValue(state: CalcState): number {
  const value = Number(state.display);
  return Number.isFinite(value) ? value : 0;
}

function clean(state: CalcState): CalcState {
  return state.error ? initialState() : state;
}

function trimNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = roundTo(value, decimals);
  if (Math.abs(rounded) >= 1e16) return rounded.toExponential(8);
  const text = rounded.toFixed(decimals);
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

export function formatEntry(display: string, locale?: string): string {
  if (display === "" || display === "-") return display || "0";
  const negative = display.startsWith("-");
  const unsigned = negative ? display.slice(1) : display;
  const [whole, fraction] = unsigned.split(".");
  const grouped = locale
    ? Number(whole || "0").toLocaleString(locale, { maximumFractionDigits: 0 })
    : whole || "0";
  const suffix = unsigned.includes(".") ? `.${fraction ?? ""}` : "";
  return `${negative ? "-" : ""}${grouped}${suffix}`;
}

export function inputDigit(state: CalcState, digit: string, decimals = 2): CalcState {
  if (!/^\d$/.test(digit)) return state;
  const next = clean(state);
  const startingFresh = !next.operator && next.lastExpression;
  if (next.waitingForOperand || startingFresh) {
    return {
      ...next,
      display: digit,
      waitingForOperand: false,
      percentLabel: null,
      lastExpression: "",
      expression: startingFresh ? "" : next.expression,
    };
  }
  if (next.display.replace("-", "").replace(".", "").length >= MAX_DIGITS) return next;
  if (next.display === "0") return { ...next, display: digit, percentLabel: null };
  if (next.display === "-0") return { ...next, display: `-${digit}`, percentLabel: null };
  return {
    ...next,
    display: next.display + digit,
    percentLabel: null,
    lastExpression: "",
  };
}

export function inputDecimal(state: CalcState): CalcState {
  const next = clean(state);
  if (next.waitingForOperand || next.lastExpression) {
    return {
      ...next,
      display: "0.",
      waitingForOperand: false,
      lastExpression: "",
      percentLabel: null,
      expression: next.lastExpression ? "" : next.expression,
    };
  }
  if (next.display.includes(".")) return next;
  return { ...next, display: `${next.display}.`, percentLabel: null };
}

export function backspace(state: CalcState): CalcState {
  const next = clean(state);
  if (next.waitingForOperand) return { ...next, display: "0" };
  const trimmed = next.display.slice(0, -1);
  return {
    ...next,
    display: trimmed === "" || trimmed === "-" ? "0" : trimmed,
    lastExpression: "",
    percentLabel: null,
  };
}

export function toggleSign(state: CalcState): CalcState {
  const next = clean(state);
  if (next.display === "0") return next;
  return {
    ...next,
    display: next.display.startsWith("-") ? next.display.slice(1) : `-${next.display}`,
    lastExpression: "",
  };
}

export function loadValue(value: number, decimals = 2): CalcState {
  return { ...initialState(), display: trimNumber(value, decimals) };
}

function calculate(
  left: number,
  right: number,
  operator: Operator,
  decimals: number,
): { value?: number; error?: CalcError } {
  let raw: number;
  switch (operator) {
    case "+":
      raw = left + right;
      break;
    case "-":
      raw = left - right;
      break;
    case "*":
      raw = left * right;
      break;
    case "/":
      if (right === 0) return { error: "divideByZero" };
      raw = left / right;
      break;
    default:
      return { error: "overflow" };
  }
  if (!Number.isFinite(raw)) return { error: "overflow" };
  return { value: roundTo(raw, Math.max(decimals, PRECISION)) };
}

export function chooseOperator(state: CalcState, operator: Operator, decimals = 2): CalcState {
  const next = clean(state);
  if (next.operator && next.accumulator !== null && !next.waitingForOperand) {
    const outcome = calculate(next.accumulator, entryValue(next), next.operator, decimals);
    if (outcome.error) return { ...next, error: outcome.error };
    const value = outcome.value as number;
    const display = trimNumber(value, decimals);
    return {
      display,
      accumulator: value,
      operator,
      waitingForOperand: true,
      expression: `${display} ${OPERATOR_SYMBOLS[operator]} `,
      lastExpression: "",
      percentLabel: null,
      error: null,
    };
  }
  const display = trimNumber(entryValue(next), decimals);
  return {
    ...next,
    display,
    accumulator: entryValue(next),
    operator,
    waitingForOperand: true,
    expression: `${display} ${OPERATOR_SYMBOLS[operator]} `,
    lastExpression: "",
    percentLabel: null,
  };
}

export function percent(state: CalcState, decimals = 2): CalcState {
  const next = clean(state);
  const value = entryValue(next);
  const ofBase = next.operator === "+" || next.operator === "-";
  const computed = ofBase && next.accumulator !== null
    ? (next.accumulator * value) / 100
    : value / 100;
  return {
    ...next,
    display: trimNumber(computed, decimals),
    waitingForOperand: false,
    percentLabel: `${trimNumber(value, decimals)}%`,
    lastExpression: "",
  };
}

export function equals(state: CalcState, decimals = 2): CalcState {
  const next = clean(state);
  if (!next.operator || next.accumulator === null) {
    return {
      ...next,
      display: trimNumber(entryValue(next), decimals),
      lastExpression: next.percentLabel
        ? `${next.expression}${next.percentLabel}`
        : next.expression,
      percentLabel: null,
    };
  }
  const right = next.waitingForOperand && next.percentLabel === null ? next.accumulator : entryValue(next);
  const outcome = calculate(next.accumulator, right, next.operator, decimals);
  if (outcome.error) return { ...next, error: outcome.error };
  const value = outcome.value as number;
  const rightLabel = next.percentLabel ?? trimNumber(right, decimals);
  return {
    display: trimNumber(value, decimals),
    accumulator: null,
    operator: null,
    waitingForOperand: true,
    expression: "",
    lastExpression: `${next.expression}${rightLabel}`,
    percentLabel: null,
    error: null,
  };
}

export type ProfitAnalysis =
  | { ok: true; profit: number; marginPct: number | null; markupPct: number | null }
  | { ok: false; error: "invalid" };

export function profitAnalysis(cost: number, revenue: number): ProfitAnalysis {
  if (!Number.isFinite(cost) || !Number.isFinite(revenue)) return { ok: false, error: "invalid" };
  const profit = roundTo(revenue - cost);
  return {
    ok: true,
    profit,
    marginPct: revenue !== 0 ? roundTo((profit / revenue) * 100) : null,
    markupPct: cost !== 0 ? roundTo((profit / cost) * 100) : null,
  };
}

export function addTax(amount: number, ratePct: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(ratePct)) return null;
  return roundTo(amount * (1 + ratePct / 100));
}

export function removeTax(amount: number, ratePct: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(ratePct)) return null;
  const divisor = 1 + ratePct / 100;
  if (divisor === 0) return null;
  return roundTo(amount / divisor);
}

export function taxAmount(amount: number, ratePct: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(ratePct)) return null;
  return roundTo((amount * ratePct) / 100);
}

export function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
