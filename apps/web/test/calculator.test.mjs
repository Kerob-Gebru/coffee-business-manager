import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
  profitAnalysis,
  addTax,
  removeTax,
  taxAmount,
  parseAmount,
} from "../src/lib/calculator.ts";

function press(keys, decimals = 2) {
  let state = initialState();
  for (const key of keys) {
    if (/^\d$/.test(key)) state = inputDigit(state, key, decimals);
    else if (key === ".") state = inputDecimal(state);
    else if (key === "+" || key === "-" || key === "*" || key === "/") {
      state = chooseOperator(state, key, decimals);
    } else if (key === "%") state = percent(state, decimals);
    else if (key === "=") state = equals(state, decimals);
    else if (key === "back") state = backspace(state);
    else if (key === "±") state = toggleSign(state);
    else throw new Error(`unknown key ${key}`);
  }
  return state;
}

test("basic arithmetic and chaining", () => {
  assert.equal(press("7+8=").display, "15");
  assert.equal(press("9-4=").display, "5");
  assert.equal(press("6*7=").display, "42");
  assert.equal(press("9/3=").display, "3");
  assert.equal(press("2+3*4=").display, "20");
  assert.equal(press("1.5*2=").display, "3");
});

test("decimal precision is rounded to the selected number of places", () => {
  assert.equal(press("0.1+0.2=", 2).display, "0.3");
  assert.equal(press("1/3=", 2).display, "0.33");
  assert.equal(press("1/3=", 4).display, "0.3333");
  assert.equal(press("10.555+0.005=", 2).display, "10.56");
});

test("percentage follows calculator conventions", () => {
  assert.equal(press("200+10%=").display, "220");
  assert.equal(press("200-10%=").display, "180");
  assert.equal(press("200*10%=").display, "20");
  assert.equal(press("200/10%=").display, "2000");
  assert.equal(press("50%=").display, "0.5");
});

test("divide by zero is rejected and the calculator recovers on clear", () => {
  const failed = press("8/0=");
  assert.equal(failed.error, "divideByZero");
  const recovered = inputDigit(initialState(), "5");
  assert.equal(recovered.display, "5");
  assert.equal(recovered.error, null);
});

test("backspace, sign toggle and clear", () => {
  let state = press("123");
  state = backspace(state);
  assert.equal(state.display, "12");
  state = backspace(backspace(state));
  assert.equal(state.display, "0");
  assert.equal(press("42±").display, "-42");
  assert.equal(initialState().display, "0");
});

test("equals without an operator keeps the entry and records the expression", () => {
  const state = press("123=");
  assert.equal(state.display, "123");
  assert.equal(state.lastExpression, "");
});

test("loading a computed value starts a fresh calculation", () => {
  const state = loadValue(1234.5678, 2);
  assert.equal(state.display, "1234.57");
  assert.equal(state.operator, null);
  assert.equal(state.lastExpression, "");

  const added = chooseOperator(state, "+", 2);
  assert.equal(added.accumulator, 1234.57);
  assert.equal(added.expression, "1234.57 + ");

  const entered = inputDigit(inputDigit(state, "5"), "0");
  assert.equal(entered.display, "1234.5750");
});

test("profit, loss, margin and markup", () => {
  const profit = profitAnalysis(400, 700);
  assert.equal(profit.ok, true);
  assert.equal(profit.profit, 300);
  assert.equal(profit.marginPct, 42.857142857143);
  assert.equal(profit.markupPct, 75);

  const loss = profitAnalysis(700, 400);
  assert.equal(loss.profit, -300);
  assert.equal(loss.marginPct, -75);

  const zeroRevenue = profitAnalysis(100, 0);
  assert.equal(zeroRevenue.marginPct, null);
  assert.equal(zeroRevenue.markupPct, -100);

  const zeroCost = profitAnalysis(0, 100);
  assert.equal(zeroCost.markupPct, null);

  assert.equal(profitAnalysis(Number.NaN, 5).ok, false);
  assert.equal(profitAnalysis(5, Number.POSITIVE_INFINITY).ok, false);
});

test("tax helpers", () => {
  assert.equal(addTax(1000, 15), 1150);
  assert.equal(removeTax(1150, 15), 1000);
  assert.equal(taxAmount(1000, 15), 150);
  assert.equal(addTax(Number.NaN, 15), null);
  assert.equal(removeTax(100, -100), null);
});

test("amount parsing and display formatting", () => {
  assert.equal(parseAmount(" 12.5 "), 12.5);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(formatEntry("1234.50", "en-US"), "1,234.50");
  assert.equal(formatEntry("0.", "en-US"), "0.");
  assert.equal(formatEntry("-12", "en-US"), "-12");
});
