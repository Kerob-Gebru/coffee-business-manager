"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import Modal from "@/components/Modal";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtMoney, fmtNumber, today } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
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
  const [showLogForm, setShowLogForm] = useState(false);

  const drivers = useMemo(
    () => contacts.filter((contact) => contact.isActive !== false),
    [contacts]
  );

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

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t("modules.vehicles")}</h2>
            <p>{t("modules.subtitleVehicles")}</p>
          </div>
          <button className="primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> {t("modules.addVehicle")}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("modules.registrationNumber")}</th>
                <th>{t("modules.vehicleType")}</th>
                <th>{t("modules.driver")}</th>
                <th className="right">{t("modules.mileage")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((vehicle) => (
                <tr key={vehicle.id} className={selected?.id === vehicle.id ? "row-selected" : undefined}>
                  <td><b>{vehicle.name}</b></td>
                  <td>{vehicle.registrationNumber}</td>
                  <td>{vehicle.vehicleType || "—"}</td>
                  <td>{vehicle.driverName || "—"}</td>
                  <td className="right amount">{fmtNumber(vehicle.currentMileage, locale)}</td>
                  <td>
                    <span className={`badge-status status-${vehicle.status}`}>
                      {t(STATUS_KEYS[vehicle.status] ?? "common.status")}
                    </span>
                  </td>
                  <td>
                    <button className="action-btn" onClick={() => loadLogs(vehicle)}>
                      <ClipboardList size={13} /> {t("modules.logs")}
                    </button>
                  </td>
                </tr>
              ))}
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
              <h2>{selected.name} · {t("modules.logs")}</h2>
              <p>
                {selected.registrationNumber} · {t("modules.mileage")}: {fmtNumber(selected.currentMileage, locale)}
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
          close={() => setShowForm(false)}
          saved={() => {
            setShowForm(false);
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
    </>
  );
}

function VehicleForm({
  drivers,
  close,
  saved,
}: {
  drivers: Contact[];
  close: () => void;
  saved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [driverContactId, setDriverContactId] = useState("");
  const [currentMileage, setCurrentMileage] = useState("0");
  const [status, setStatus] = useState("active");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api("/vehicles", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          registrationNumber: registrationNumber.trim(),
          vehicleType: vehicleType.trim() || undefined,
          driverContactId: driverContactId || undefined,
          currentMileage: currentMileage.trim() || "0",
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
    <Modal title={t("modules.addVehicle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <div className="form-row">
          <label>
            {t("common.name")}
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {t("modules.registrationNumber")}
            <input required value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t("modules.vehicleType")}
            <input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} />
          </label>
          <label>
            {t("modules.mileage")}
            <input type="number" min="0" step="0.001" value={currentMileage} onChange={(e) => setCurrentMileage(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t("modules.driver")} <small>{t("common.optional")}</small>
            <select value={driverContactId} onChange={(e) => setDriverContactId(e.target.value)}>
              <option value="">—</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t("common.status")}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">{t("modules.vehicleActive")}</option>
              <option value="maintenance">{t("modules.maintenance")}</option>
              <option value="inactive">{t("modules.inactive")}</option>
            </select>
          </label>
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
  const [currency, setCurrency] = useState("ETB");
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
        <p className="form-note">{vehicle.name} · {vehicle.registrationNumber}</p>
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
            <input type="date" required value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          </label>
        </div>
        <label>
          {t("modules.description")}
          <input required value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            {t("modules.mileageKm")}
            <input type="number" min="0" step="0.001" required value={mileageKm} onChange={(e) => setMileageKm(e.target.value)} />
          </label>
          <label>
            {t("modules.cost")} <small>{t("common.optional")}</small>
            <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
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
