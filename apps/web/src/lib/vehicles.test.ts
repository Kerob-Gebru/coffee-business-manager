import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateVehicleNet,
  deriveVehicleName,
  parseMoneyValue,
  summarizeVehiclesByCurrency,
} from "./vehicles";

test("parseMoneyValue parses strings, numbers, and empty values safely", () => {
  assert.equal(parseMoneyValue("12500.50"), 12500.5);
  assert.equal(parseMoneyValue(" 420 "), 420);
  assert.equal(parseMoneyValue(99.25), 99.25);
  assert.equal(parseMoneyValue(""), 0);
  assert.equal(parseMoneyValue(null), 0);
  assert.equal(parseMoneyValue(undefined), 0);
  assert.equal(parseMoneyValue("abc"), 0);
});

test("calculateVehicleNet subtracts cost taken from gross amount accurately", () => {
  assert.equal(calculateVehicleNet("120000", "18500"), "101500.00");
  assert.equal(calculateVehicleNet("120.10", "20.05"), "100.05");
  assert.equal(calculateVehicleNet("5000", "6500.25"), "-1500.25");
  assert.equal(calculateVehicleNet("1000", "1000"), "0.00");
  assert.equal(calculateVehicleNet("", ""), "0.00");
});

test("deriveVehicleName builds a valid fallback name when omitted", () => {
  assert.equal(
    deriveVehicleName({
      name: "Isuzu FSR",
      driverName: "Dawit",
      registrationNumber: "ET-3-48291",
    }),
    "Isuzu FSR",
  );
  assert.equal(
    deriveVehicleName({
      driverName: "Abebe Kebede",
      registrationNumber: "AA-3-90122",
    }),
    "Abebe Kebede (AA-3-90122)",
  );
  assert.equal(
    deriveVehicleName({
      registrationNumber: "A1",
    }),
    "A1",
  );
  assert.equal(
    deriveVehicleName({
      registrationNumber: "7",
    }),
    "Vehicle 7",
  );
});

test("summarizeVehiclesByCurrency aggregates gross, cost, and net per currency", () => {
  const summary = summarizeVehiclesByCurrency([
    { grossAmount: "85000", costTaken: "14500", currency: "ETB" },
    { grossAmount: "40000.50", costTaken: "5500.25", currency: "etb" },
    { grossAmount: "2000", costTaken: "350", currency: "USD" },
  ]);

  assert.deepEqual(summary, [
    {
      currency: "ETB",
      grossTotal: "125000.50",
      costTotal: "20000.25",
      netTotal: "105000.25",
      count: 2,
    },
    {
      currency: "USD",
      grossTotal: "2000.00",
      costTotal: "350.00",
      netTotal: "1650.00",
      count: 1,
    },
  ]);
});
