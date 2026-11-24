"use client";

import { useEffect, useMemo, useState } from "react";
import { api, apiError } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n";

type ReportTab = "finance" | "coffee" | "processing" | "inventory" | "vehicles" | "employees";

type FinanceReport = {
  transactions: {
    income: number;
    expense: number;
    net: number;
    byKind: Record<string, { total: number; entries: number }>;
  };
  invoices: Array<{ partyType: string; status: string; total: number; paid: number; outstanding: number }>;
};

type CoffeeReport = {
  rows: Array<{ tradeType: string; grade: string; lots: number; weightKg: number; avgMoisture: number }>;
};

type ProcessingReport = {
  rows: Array<{
    status: string;
    batches: number;
    inputQuantity: number;
    outputQuantity: number;
    wasteQuantity: number;
    yieldPct: number;
  }>;
};

type InventoryReport = {
  items: Array<{
    id: number;
    itemName: string;
    warehouseLocation: string;
    bagCount: number;
    totalWeightKg: number;
    receivedBags: number;
    issuedBags: number;
    receivedWeightKg: number;
    issuedWeightKg: number;
  }>;
  totals: { items: number; bags: number; weightKg: number };
};

type VehicleReport = {
  vehicles: Array<{
    id: number;
    name: string;
    registrationNumber: string;
    status: string;
    currentMileage: number;
    logs: number;
    fuelCost: number;
    maintenanceCost: number;
    totalCost: number;
  }>;
};

type EmployeeReport = {
  totalEmployees: number;
  activeEmployees: number;
  archivedEmployees: number;
  salaryByStatus: Array<{ status: string; records: number; total: number }>;
};

type ReportData =
  | { tab: "finance"; data: FinanceReport }
  | { tab: "coffee"; data: CoffeeReport }
  | { tab: "processing"; data: ProcessingReport }
  | { tab: "inventory"; data: InventoryReport }
  | { tab: "vehicles"; data: VehicleReport }
  | { tab: "employees"; data: EmployeeReport };

const TABS: Array<{ id: ReportTab; labelKey: TranslationKey; path: string }> = [
  { id: "finance", labelKey: "reports.finance", path: "/reports/finance" },
  { id: "coffee", labelKey: "reports.coffee", path: "/reports/coffee-trades" },
  { id: "processing", labelKey: "reports.processing", path: "/reports/processing" },
  { id: "inventory", labelKey: "reports.inventory", path: "/reports/inventory" },
  { id: "vehicles", labelKey: "reports.vehicles", path: "/reports/vehicles" },
  { id: "employees", labelKey: "reports.employees", path: "/reports/employees" },
];

const STATUS_KEYS: Record<string, TranslationKey> = {
  draft: "invoices.draft",
  sent: "invoices.sent",
  partially_paid: "invoices.partiallyPaid",
  paid: "invoices.paid",
  cancelled: "invoices.cancelled",
  planned: "modules.planned",
  running: "modules.running",
  completed: "modules.completed",
  active: "modules.vehicleActive",
  maintenance: "modules.maintenance",
  inactive: "modules.inactive",
};

export default function ReportsModule() {
  const { t, locale } = useTranslation();
  const [tab, setTab] = useState<ReportTab>("finance");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState({ from: "", to: "" });
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activeTab = useMemo(() => TABS.find((item) => item.id === tab)!, [tab]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (applied.from) params.set("from", applied.from);
      if (applied.to) params.set("to", applied.to);
      const query = params.toString();
      const response = await api(`${activeTab.path}${query ? `?${query}` : ""}`);
      if (!response.ok) {
        setError(await apiError(response, t("common.error")));
        return;
      }
      setReport({ tab: activeTab.id, data: await response.json() } as ReportData);
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, applied]);

  const supportsRange = activeTab.id !== "inventory" && activeTab.id !== "employees";

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("reports.title")}</h2>
          <p>{t("reports.subtitle")}</p>
        </div>
      </div>

      <div className="filter-tabs report-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`filter-tab ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {supportsRange && (
        <div className="report-filters">
          <label>
            {t("reports.from")}
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            {t("reports.to")}
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="primary" onClick={() => setApplied({ from, to })}>
            {t("reports.apply")}
          </button>
          <button
            className="secondary"
            onClick={() => {
              setFrom("");
              setTo("");
              setApplied({ from: "", to: "" });
            }}
          >
            {t("reports.reset")}
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loading && <div className="empty">{t("common.loading")}</div>}

      {!loading && report?.tab === "finance" && <FinanceTable report={report.data} />}
      {!loading && report?.tab === "coffee" && <CoffeeTable report={report.data} />}
      {!loading && report?.tab === "processing" && <ProcessingTable report={report.data} />}
      {!loading && report?.tab === "inventory" && <InventoryTable report={report.data} />}
      {!loading && report?.tab === "vehicles" && <VehicleTable report={report.data} />}
      {!loading && report?.tab === "employees" && <EmployeeTable report={report.data} />}
    </section>
  );

  function FinanceTable({ report }: { report: FinanceReport }) {
    const kinds = Object.entries(report.transactions.byKind);
    return (
      <>
        <div className="stats-grid stats-grid-3">
          <MiniStat label={t("reports.income")} value={fmtNumber(report.transactions.income, locale)} />
          <MiniStat label={t("reports.expense")} value={fmtNumber(report.transactions.expense, locale)} />
          <MiniStat label={t("reports.net")} value={fmtNumber(report.transactions.net, locale)} />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("finance.type")}</th>
                <th className="right">{t("reports.entries")}</th>
                <th className="right">{t("finance.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {kinds.map(([kind, value]) => (
                <tr key={kind}>
                  <td><b>{t(`transactionKinds.${kind}` as TranslationKey)}</b></td>
                  <td className="right">{value.entries}</td>
                  <td className="right amount">{fmtNumber(value.total, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!kinds.length && <div className="empty">{t("reports.noData")}</div>}
        </div>

        <h3 className="sub-title">{t("reports.invoiceOutstanding")}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("invoices.partyType")}</th>
                <th>{t("invoices.status")}</th>
                <th className="right">{t("invoices.totalAmount")}</th>
                <th className="right">{t("invoices.amountPaid")}</th>
                <th className="right">{t("invoices.outstanding")}</th>
              </tr>
            </thead>
            <tbody>
              {report.invoices.map((row, index) => (
                <tr key={`${row.partyType}-${row.status}-${index}`}>
                  <td>{row.partyType === "customer" ? t("invoices.customer") : t("invoices.supplier")}</td>
                  <td>{t(STATUS_KEYS[row.status] ?? "invoices.status")}</td>
                  <td className="right">{fmtNumber(row.total, locale)}</td>
                  <td className="right">{fmtNumber(row.paid, locale)}</td>
                  <td className="right amount">{fmtNumber(row.outstanding, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.invoices.length && <div className="empty">{t("reports.noData")}</div>}
        </div>
      </>
    );
  }

  function CoffeeTable({ report }: { report: CoffeeReport }) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("modules.tradeType")}</th>
              <th>{t("modules.grade")}</th>
              <th className="right">{t("reports.lots")}</th>
              <th className="right">{t("modules.weightKg")}</th>
              <th className="right">{t("reports.avgMoisture")}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, index) => (
              <tr key={`${row.tradeType}-${row.grade}-${index}`}>
                <td>{row.tradeType === "purchase" ? t("modules.purchase") : t("modules.sale")}</td>
                <td><b>{row.grade}</b></td>
                <td className="right">{row.lots}</td>
                <td className="right amount">{fmtNumber(row.weightKg, locale, 3)}</td>
                <td className="right">{fmtNumber(row.avgMoisture, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.rows.length && <div className="empty">{t("reports.noData")}</div>}
      </div>
    );
  }

  function ProcessingTable({ report }: { report: ProcessingReport }) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("common.status")}</th>
              <th className="right">{t("reports.batches")}</th>
              <th className="right">{t("reports.input")}</th>
              <th className="right">{t("reports.output")}</th>
              <th className="right">{t("reports.waste")}</th>
              <th className="right">{t("reports.yield")}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.status}>
                <td><b>{t(STATUS_KEYS[row.status] ?? "common.status")}</b></td>
                <td className="right">{row.batches}</td>
                <td className="right">{fmtNumber(row.inputQuantity, locale, 3)}</td>
                <td className="right">{fmtNumber(row.outputQuantity, locale, 3)}</td>
                <td className="right">{fmtNumber(row.wasteQuantity, locale, 3)}</td>
                <td className="right amount">{fmtNumber(row.yieldPct, locale)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.rows.length && <div className="empty">{t("reports.noData")}</div>}
      </div>
    );
  }

  function InventoryTable({ report }: { report: InventoryReport }) {
    return (
      <>
        <div className="stats-grid stats-grid-3">
          <MiniStat label={t("reports.items")} value={String(report.totals.items)} />
          <MiniStat label={t("modules.bagCount")} value={String(report.totals.bags)} />
          <MiniStat label={t("modules.totalWeight")} value={fmtNumber(report.totals.weightKg, locale, 3)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("modules.itemName")}</th>
                <th>{t("modules.warehouse")}</th>
                <th className="right">{t("modules.bagCount")}</th>
                <th className="right">{t("modules.totalWeight")}</th>
                <th className="right">{t("reports.receivedBags")}</th>
                <th className="right">{t("reports.issuedBags")}</th>
                <th className="right">{t("reports.receivedWeight")}</th>
                <th className="right">{t("reports.issuedWeight")}</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.id}>
                  <td><b>{item.itemName}</b></td>
                  <td>{item.warehouseLocation}</td>
                  <td className="right">{item.bagCount}</td>
                  <td className="right amount">{fmtNumber(item.totalWeightKg, locale, 3)}</td>
                  <td className="right">{item.receivedBags}</td>
                  <td className="right">{item.issuedBags}</td>
                  <td className="right">{fmtNumber(item.receivedWeightKg, locale, 3)}</td>
                  <td className="right">{fmtNumber(item.issuedWeightKg, locale, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.items.length && <div className="empty">{t("reports.noData")}</div>}
        </div>
      </>
    );
  }

  function VehicleTable({ report }: { report: VehicleReport }) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("common.name")}</th>
              <th>{t("modules.registrationNumber")}</th>
              <th>{t("common.status")}</th>
              <th className="right">{t("reports.fuelCost")}</th>
              <th className="right">{t("reports.maintenanceCost")}</th>
              <th className="right">{t("reports.totalCost")}</th>
            </tr>
          </thead>
          <tbody>
            {report.vehicles.map((vehicle) => (
              <tr key={vehicle.id}>
                <td><b>{vehicle.name}</b></td>
                <td>{vehicle.registrationNumber}</td>
                <td>{t(STATUS_KEYS[vehicle.status] ?? "common.status")}</td>
                <td className="right">{fmtNumber(vehicle.fuelCost, locale)}</td>
                <td className="right">{fmtNumber(vehicle.maintenanceCost, locale)}</td>
                <td className="right amount">{fmtNumber(vehicle.totalCost, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.vehicles.length && <div className="empty">{t("reports.noData")}</div>}
      </div>
    );
  }

  function EmployeeTable({ report }: { report: EmployeeReport }) {
    return (
      <>
        <div className="stats-grid stats-grid-3">
          <MiniStat label={t("reports.totalEmployees")} value={String(report.totalEmployees)} />
          <MiniStat label={t("reports.activeEmployees")} value={String(report.activeEmployees)} />
          <MiniStat label={t("reports.archivedEmployees")} value={String(report.archivedEmployees)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("common.status")}</th>
                <th className="right">{t("reports.salary")}</th>
                <th className="right">{t("finance.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {report.salaryByStatus.map((row) => (
                <tr key={row.status}>
                  <td><b>{row.status}</b></td>
                  <td className="right">{row.records}</td>
                  <td className="right amount">{fmtNumber(row.total, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.salaryByStatus.length && <div className="empty">{t("reports.noData")}</div>}
        </div>
      </>
    );
  }
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}
