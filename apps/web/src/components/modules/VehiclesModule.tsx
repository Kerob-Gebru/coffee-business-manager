"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtMoney, fmtNumber, today } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { calculateVehicleNet, summarizeVehiclesByCurrency } from "@/lib/vehicles";
import type { Contact, Vehicle, VehicleLog } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

const STATUS_KEYS: Record<string, TranslationKey> = {
  active: "modules.vehicleActive",
  maintenance: "modules.maintenance",
  inactive: "modules.inactive",
};

export default function VehiclesModule({
  contacts,
  onNotice,
}: {
  contacts: Contact[];
  onNotice: (message: string) => void;
}) {
  const { t, locale } = useTranslation();
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showLogForm, setShowLogForm] = useState(false);

  const drivers = useMemo(
    () => contacts.filter((contact) => contact.isActive !== false),
    [contacts],
  );

  const currencySummaries = useMemo(() => summarizeVehiclesByCurrency(rows), [rows]);

  function formatSummaryValues(kind: "grossTotal" | "costTotal" | "netTotal") {
    if (!currencySummaries.length) return fmtMoney(0, "ETB", locale);
    return currencySummaries
      .map((entry) => fmtMoney(entry[kind], entry.currency, locale))
      .join(" · ");
  }

  async function load() {
    setLoading(true);
    try {
      const response = await api("/vehicles");
      if (!response.ok) {
        setError(await apiError(response, t("common.error")));
        return;
      }
      setRows(await response.json());
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs(vehicle: Vehicle) {
    setSelected(vehicle);
    try {
      const response = await api(`/vehicles/${vehicle.id}/logs`);
      if (response.ok) setLogs(await response.json());
      else setLogs([]);
    } catch {
      setLogs([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = rows.find((row) => row.id === selected?.id);
    if (next) setSelected(next);
  }, [rows, selected?.id]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const response = await api(`/vehicles/${deleting.id}`, { method: "DELETE" });
      if (!response.ok) {
        setDeleteError(await apiError(response, t("common.error")));
        setDeleteBusy(false);
        return;
      }
      if (selected?.id === deleting.id) {
        setSelected(null);
        setLogs([]);
      }
      setDeleting(null);
      setDeleteBusy(false);
      await load();
      onNotice(t("modules.vehicleDeleted"));
    } catch {
      setDeleteError(t("common.error"));
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head vehicle-panel-head">
          <div>
            <h2>{t("modules.vehicles")}</h2>
            <p>{t("modules.subtitleVehicles")}</p>
          </div>
          <button
            className="primary"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus size={16} /> {t("modules.addVehicle")}
          </button>
        </div>

        {rows.length > 0 && (
          <div className="stats-grid stats-grid-3 vehicle-stats">
            <div className="stat-card">
              <div className="stat-top">
                <span>{t("modules.grossAmount")}</span>
              </div>
              <strong>{formatSummaryValues("grossTotal")}</strong>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <span>{t("modules.costTaken")}</span>
              </div>
              <strong>{formatSummaryValues("costTotal")}</strong>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <span>{t("modules.netToAccount")}</span>
              </div>
              <strong className="positive-text">{formatSummaryValues("netTotal")}</strong>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="table-wrap vehicles-table">
          <table>
            <thead>
              <tr>
                <th>{t("modules.driverName")}</th>
                <th>{t("modules.licensePlate")}</th>
                <th>{t("modules.cargoItem")}</th>
                <th>{t("modules.cargoOwner")}</th>
                <th>{t("modules.cargoQuantity")}</th>
                <th className="right">{t("modules.grossAmount")}</th>
                <th className="right">{t("modules.costTaken")}</th>
                <th className="right">{t("modules.netToAccount")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((vehicle) => {
                const netValue = calculateVehicleNet(vehicle.grossAmount, vehicle.costTaken);
                const isNegativeNet = Number(netValue) < 0;
                const currency = vehicle.currency || "ETB";
                return (
                  <tr
                    key={vehicle.id}
                    className={selected?.id === vehicle.id ? "row-selected" : undefined}
                  >
                    <td>
                      <b>{vehicle.driverName || "—"}</b>
                    </td>
                    <td className="nowrap">{vehicle.registrationNumber}</td>
                    <td>{vehicle.cargoItem || "—"}</td>
                    <td>{vehicle.cargoOwner || "—"}</td>
                    <td>{vehicle.cargoQuantity || "—"}</td>
                    <td className="right amount">
                      {fmtMoney(vehicle.grossAmount, currency, locale)}
                    </td>
                    <td className="right">
                      {fmtMoney(vehicle.costTaken, currency, locale)}
                    </td>
                    <td
                      className={`right amount ${isNegativeNet ? "danger-text" : "positive-text"}`}
                    >
                      {fmtMoney(netValue, currency, locale)}
                    </td>
                    <td className="nowrap">
                      <span className={`badge-status status-${vehicle.status}`}>
                        {t(STATUS_KEYS[vehicle.status] ?? "common.status")}
                      </span>
                    </td>
                    <td className="nowrap">
                      <div className="row-actions">
                        <button
                          className="action-btn"
                          aria-label={`${t("modules.edit")} ${vehicle.registrationNumber}`}
                          onClick={() => {
                            setEditing(vehicle);
                            setShowForm(true);
                          }}
                        >
                          <Pencil size={13} /> {t("modules.edit")}
                        </button>
                        <button
                          className="action-btn"
                          aria-label={`${t("modules.logs")} ${vehicle.registrationNumber}`}
                          onClick={() => loadLogs(vehicle)}
                        >
                          <ClipboardList size={13} /> {t("modules.logs")}
                        </button>
                        <button
                          className="action-btn danger"
                          aria-label={`${t("modules.delete")} ${vehicle.registrationNumber}`}
                          onClick={() => {
                            setDeleteError("");
                            setDeleting(vehicle);
                          }}
                        >
                          <Trash2 size={13} /> {t("modules.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && (
            <div className="empty">{loading ? t("common.loading") : t("modules.noVehicles")}</div>
          )}
        </div>
      </section>

      {selected && (
        <section className="panel sub-panel">
          <div className="panel-head">
            <div>
              <h2>
                {selected.driverName || selected.name} · {t("modules.logs")}
              </h2>
              <p>
                {selected.registrationNumber}
                {selected.cargoItem ? ` · ${selected.cargoItem}` : ""}
              </p>
            </div>
            <button className="secondary" onClick={() => setShowLogForm(true)}>
              <Plus size={16} /> {t("modules.addLog")}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("modules.logType")}</th>
                  <th>{t("modules.description")}</th>
                  <th className="right">{t("modules.mileageKm")}</th>
                  <th className="right">{t("modules.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{fmtDate(log.logDate, locale)}</td>
                    <td>
                      <span className={`badge-status status-${log.logType}`}>
                        {log.logType === "fuel" ? t("modules.fuel") : t("modules.maintenance")}
                      </span>
                    </td>
                    <td>{log.description}</td>
                    <td className="right">{fmtNumber(log.mileageKm, locale)}</td>
                    <td className="right amount">{fmtMoney(log.cost, log.currency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!logs.length && <div className="empty">{t("modules.noLogs")}</div>}
          </div>
        </section>
      )}

      {showForm && (
        <VehicleForm
          drivers={drivers}
          initial={editing}
          close={() => {
            setShowForm(false);
            setEditing(null);
          }}
          saved={() => {
            setShowForm(false);
            setEditing(null);
            load();
            onNotice(t("common.saved"));
          }}
        />
      )}

      {showLogForm && selected && (
        <VehicleLogForm
          vehicle={selected}
          close={() => setShowLogForm(false)}
          saved={() => {
            setShowLogForm(false);
            load();
            loadLogs(selected);
            onNotice(t("common.saved"));
          }}
        />
      )}

      {deleting && (
        <Modal
          title={t("modules.deleteVehicle")}
          close={() => {
            if (!deleteBusy) setDeleting(null);
          }}
          closeAriaLabel={t("common.close")}
        >
          <p className="form-note">
            {deleting.driverName || deleting.name} · {deleting.registrationNumber}
          </p>
          <p className="confirm-msg">{t("modules.deleteVehicleConfirm")}</p>
          {deleteError && <p className="error">{deleteError}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setDeleting(null)}
              disabled={deleteBusy}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="danger-btn"
              onClick={confirmDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? t("common.loading") : t("modules.delete")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function VehicleForm({
  drivers,
  initial,
  close,
  saved,
}: {
  drivers: Contact[];
  initial: Vehicle | null;
  close: () => void;
  saved: () => void;
}) {
  const { t, locale } = useTranslation();
  const [driverName, setDriverName] = useState(initial?.driverName ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(
    initial?.registrationNumber ?? "",
  );
  const [cargoItem, setCargoItem] = useState(initial?.cargoItem ?? "");
  const [cargoOwner, setCargoOwner] = useState(initial?.cargoOwner ?? "");
  const [cargoQuantity, setCargoQuantity] = useState(initial?.cargoQuantity ?? "");
  const [grossAmount, setGrossAmount] = useState(initial?.grossAmount ?? "0");
  const [costTaken, setCostTaken] = useState(initial?.costTaken ?? "0");
  const [currency, setCurrency] = useState(initial?.currency ?? "ETB");
  const [status, setStatus] = useState<"active" | "maintenance" | "inactive">(
    initial?.status ?? "active",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const previewNet = useMemo(
    () => calculateVehicleNet(grossAmount, costTaken),
    [grossAmount, costTaken],
  );
  const isNegativePreview = Number(previewNet) < 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const trimmedDriver = driverName.trim();
    const matchedDriver = drivers.find(
      (d) => d.name.trim().toLowerCase() === trimmedDriver.toLowerCase(),
    );

    try {
      const endpoint = initial ? `/vehicles/${initial.id}` : "/vehicles";
      const method = initial ? "PATCH" : "POST";
      const response = await api(endpoint, {
        method,
        body: JSON.stringify({
          driverName: trimmedDriver,
          driverContactId: matchedDriver ? matchedDriver.id : null,
          registrationNumber: registrationNumber.trim(),
          cargoItem: cargoItem.trim(),
          cargoOwner: cargoOwner.trim(),
          cargoQuantity: cargoQuantity.trim(),
          grossAmount: grossAmount.trim() || "0",
          costTaken: costTaken.trim() || "0",
          currency,
          status,
        }),
      });
      if (!response.ok) {
        setError(await apiError(response, t("common.error")));
        setBusy(false);
        return;
      }
      saved();
    } catch {
      setError(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title={initial ? t("modules.editVehicle") : t("modules.addVehicle")}
      close={close}
      closeAriaLabel={t("common.close")}
    >
      <form onSubmit={submit}>
        <div className="form-grid-2">
          <label>
            {t("modules.driverName")}
            <input
              required
              list="vehicle-driver-suggestions"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
            <datalist id="vehicle-driver-suggestions">
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.name} />
              ))}
            </datalist>
          </label>
          <label>
            {t("modules.licensePlate")}
            <input
              required
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
            />
          </label>
        </div>

        <div className="form-grid-2">
          <label>
            {t("modules.cargoItem")}
            <input value={cargoItem} onChange={(e) => setCargoItem(e.target.value)} />
          </label>
          <label>
            {t("modules.cargoOwner")}
            <input value={cargoOwner} onChange={(e) => setCargoOwner(e.target.value)} />
          </label>
        </div>

        <div className="form-grid-2">
          <label>
            {t("modules.cargoQuantity")}
            <input value={cargoQuantity} onChange={(e) => setCargoQuantity(e.target.value)} />
          </label>
          <label>
            {t("common.status")}
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "active" | "maintenance" | "inactive")
              }
            >
              <option value="active">{t("modules.vehicleActive")}</option>
              <option value="maintenance">{t("modules.maintenance")}</option>
              <option value="inactive">{t("modules.inactive")}</option>
            </select>
          </label>
        </div>

        <div className="form-grid-money">
          <label>
            {t("modules.grossAmount")}
            <input
              type="number"
              min="0"
              step="0.01"
              value={grossAmount}
              onChange={(e) => setGrossAmount(e.target.value)}
            />
          </label>
          <label>
            {t("modules.costTaken")}
            <input
              type="number"
              min="0"
              step="0.01"
              value={costTaken}
              onChange={(e) => setCostTaken(e.target.value)}
            />
          </label>
          <label>
            {t("finance.currency")}
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="ETB">ETB</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>

        <div className="vehicle-net-preview">
          <span>{t("modules.netToAccount")}</span>
          <strong className={isNegativePreview ? "danger-text" : "positive-text"}>
            {fmtMoney(previewNet, currency, locale)}
          </strong>
        </div>

        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function VehicleLogForm({
  vehicle,
  close,
  saved,
}: {
  vehicle: Vehicle;
  close: () => void;
  saved: () => void;
}) {
  const { t } = useTranslation();
  const [logType, setLogType] = useState("fuel");
  const [description, setDescription] = useState("");
  const [mileageKm, setMileageKm] = useState(vehicle.currentMileage);
  const [logDate, setLogDate] = useState(today());
  const [cost, setCost] = useState("");
  const [currency, setCurrency] = useState(vehicle.currency || "ETB");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api(`/vehicles/${vehicle.id}/logs`, {
        method: "POST",
        body: JSON.stringify({
          logType,
          description: description.trim(),
          mileageKm: mileageKm.trim(),
          logDate,
          cost: cost.trim() || undefined,
          currency,
        }),
      });
      if (!response.ok) {
        setError(await apiError(response, t("common.error")));
        setBusy(false);
        return;
      }
      saved();
    } catch {
      setError(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <Modal title={t("modules.logTitle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <p className="form-note">
          {vehicle.driverName || vehicle.name} · {vehicle.registrationNumber}
        </p>
        <div className="form-row">
          <label>
            {t("modules.logType")}
            <select value={logType} onChange={(e) => setLogType(e.target.value)}>
              <option value="fuel">{t("modules.fuel")}</option>
              <option value="maintenance">{t("modules.maintenance")}</option>
            </select>
          </label>
          <label>
            {t("common.date")}
            <input
              type="date"
              required
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
            />
          </label>
        </div>
        <label>
          {t("modules.description")}
          <input required value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            {t("modules.mileageKm")}
            <input
              type="number"
              min="0"
              step="0.001"
              required
              value={mileageKm}
              onChange={(e) => setMileageKm(e.target.value)}
            />
          </label>
          <label>
            {t("modules.cost")} <small>{t("common.optional")}</small>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
        </div>
        <label>
          {t("finance.currency")}
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="ETB">ETB</option>
            <option value="USD">USD</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
