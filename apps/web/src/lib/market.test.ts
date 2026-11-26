import test from "node:test";
import assert from "node:assert/strict";
import { estimateCommodityValue, filterCommoditiesByCategory } from "./market";

test("estimateCommodityValue calculates coffee per-kg USD and ETB valuation", () => {
  const result = estimateCommodityValue(
    {
      usdPerKg: 6.25,
      etbPerKg: 781.25,
      usdPerGram: null,
      etbPerGram: null,
      usdPrice: 2.835,
      etbPrice: 354.38,
    },
    100,
    125,
  );
  assert.deepEqual(result, {
    unitLabel: "kg",
    unitUsd: 6.25,
    unitEtb: 781.25,
    totalUsd: 625,
    totalEtb: 78125,
  });
});

test("estimateCommodityValue calculates gold per-gram valuation and derives ETB when missing", () => {
  const result = estimateCommodityValue(
    {
      usdPerKg: null,
      etbPerKg: null,
      usdPerGram: 85,
      etbPerGram: null,
      usdPrice: 2643.8,
      etbPrice: null,
    },
    10,
    120,
  );
  assert.deepEqual(result, {
    unitLabel: "g",
    unitUsd: 85,
    unitEtb: 10200,
    totalUsd: 850,
    totalEtb: 102000,
  });
});

test("estimateCommodityValue returns null for invalid or negative quantities", () => {
  const quote = {
    usdPerKg: 5,
    etbPerKg: 600,
    usdPerGram: null,
    etbPerGram: null,
    usdPrice: 2.27,
    etbPrice: 272,
  };
  assert.equal(estimateCommodityValue(quote, null, 120), null);
  assert.equal(estimateCommodityValue(quote, -5, 120), null);
});

test("filterCommoditiesByCategory filters instruments cleanly", () => {
  const items = [
    { id: "coffee", category: "agricultural" },
    { id: "gold", category: "metals" },
    { id: "brent", category: "energy" },
  ];
  assert.equal(filterCommoditiesByCategory(items, "all").length, 3);
  assert.deepEqual(
    filterCommoditiesByCategory(items, "metals").map((i) => i.id),
    ["gold"],
  );
});
