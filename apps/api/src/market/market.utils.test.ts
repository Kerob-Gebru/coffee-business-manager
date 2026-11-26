import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMODITY_INSTRUMENTS,
  computeEtbEquivalent,
  computeUsdPerGram,
  computeUsdPerKg,
  parseYahooChartResponse,
} from "./market.utils";

test("converts coffee cents/lb to USD/kg and ETB/kg accurately", () => {
  const coffee = COMMODITY_INSTRUMENTS.find((c) => c.id === "coffee")!;
  const usdPerKg = computeUsdPerKg(coffee, 265.65);
  assert.ok(usdPerKg !== null);
  assert.equal(usdPerKg, Number(((265.65 / 100) * 2.20462262185).toFixed(4)));
  const etbPerKg = computeEtbEquivalent(usdPerKg, 160);
  assert.equal(etbPerKg, Number((usdPerKg * 160).toFixed(2)));
});

test("converts precious metals USD/oz to USD/g and excludes perKg for Brent oil", () => {
  const gold = COMMODITY_INSTRUMENTS.find((c) => c.id === "gold")!;
  const brent = COMMODITY_INSTRUMENTS.find((c) => c.id === "brent")!;

  const goldPerGram = computeUsdPerGram(gold, 3110.34768);
  assert.ok(goldPerGram !== null);
  assert.ok(Math.abs(goldPerGram - 100) < 0.001);

  assert.equal(computeUsdPerKg(brent, 91.43), null);
  assert.equal(computeUsdPerGram(brent, 91.43), null);
});

test("parses Yahoo Finance chart payload and computes daily & monthly changes accurately", () => {
  const coffee = COMMODITY_INSTRUMENTS.find((c) => c.id === "coffee")!;
  const payload = {
    chart: {
      result: [
        {
          meta: {
            symbol: "KC=F",
            fullExchangeName: "ICE Futures",
            regularMarketPrice: 270,
            regularMarketTime: Math.floor(Date.parse("2026-11-26T15:00:00Z") / 1000),
            regularMarketDayHigh: 274,
            regularMarketDayLow: 266,
            fiftyTwoWeekHigh: 340,
            fiftyTwoWeekLow: 210,
            chartPreviousClose: 250,
          },
          timestamp: [
            Math.floor(Date.parse("2026-11-24T15:00:00Z") / 1000),
            Math.floor(Date.parse("2026-11-25T15:00:00Z") / 1000),
            Math.floor(Date.parse("2026-11-26T15:00:00Z") / 1000),
          ],
          indicators: {
            quote: [{ close: [260, 265, 270] }],
          },
        },
      ],
    },
  };

  const parsed = parseYahooChartResponse(coffee, payload, 150);
  assert.ok(parsed);
  assert.equal(parsed.price, 270);
  assert.equal(parsed.previousClose, 265);
  assert.equal(parsed.change, 5);
  assert.equal(parsed.changePercent, 1.89);
  assert.equal(parsed.monthChangePercent, 8);
  assert.equal(parsed.history.length, 3);
  assert.ok(parsed.etbPerKg !== null && parsed.etbPerKg > 800);
});

test("returns null for invalid or missing Yahoo payloads", () => {
  const gold = COMMODITY_INSTRUMENTS.find((c) => c.id === "gold")!;
  assert.equal(parseYahooChartResponse(gold, null), null);
  assert.equal(parseYahooChartResponse(gold, { chart: { result: [{ meta: { regularMarketPrice: 0 } }] } }), null);
});
