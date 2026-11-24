"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Plus, RotateCcw } from "lucide-react";
import Modal from "@/components/Modal";
import { api, apiError } from "@/lib/api";
import { fmtDate, today } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Contact, Employee } from "@/lib/types";

export default function EmployeesModule({
  contacts,
  onNotice,
}: {
  contacts: Contact[];
  onNotice: (message: string) => void;
}) {
  const { t, locale } = useTranslation();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const linkableContacts = useMemo(
    () => contacts.filter((contact) => contact.isActive !== false),
    [contacts]
  );

  async function load() {
    setLoading(true);
    try {
      const response = await api(`/employees?status=${tab}`);
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function setActive(employee: Employee, isActive: boolean) {
    setBusyId(employee.id);
    try {
      const response = await api(`/employees/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      if (!response.ok) {
        setError(await apiError(response, t("common.error")));
        return;
      }
      load();
      onNotice(t("common.saved"));
    } catch {
      setError(t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("modules.employees")}</h2>
          <p>{t("modules.subtitleEmployees")}</p>
        </div>
        <button className="primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> {t("modules.addEmployee")}
        </button>
      </div>

      <div className="filter-tabs">
        <button className={`filter-tab ${tab === "active" ? "active" : ""}`} onClick={() => setTab("active")}>
          {t("modules.activeEmployees")}
        </button>
        <button className={`filter-tab ${tab === "archived" ? "active" : ""}`} onClick={() => setTab("archived")}>
          {t("modules.archivedEmployees")}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("auth.fullName")}</th>
              <th>{t("common.phone")}</th>
              <th>{t("modules.jobTitle")}</th>
              <th>{t("modules.startDate")}</th>
              <th>{t("modules.contact")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((employee) => (
              <tr key={employee.id}>
                <td><b>{employee.fullName}</b></td>
                <td>{employee.phone || "—"}</td>
                <td>{employee.jobTitle || "—"}</td>
                <td>{fmtDate(employee.startDate, locale)}</td>
                <td>{employee.contactName || "—"}</td>
                <td>
                  {employee.isActive ? (
                    <button
                      className="action-btn danger"
                      disabled={busyId === employee.id}
                      onClick={() => setActive(employee, false)}
                    >
                      <Archive size={13} /> {t("modules.archiveEmployee")}
                    </button>
                  ) : (
                    <button
                      className="action-btn"
                      disabled={busyId === employee.id}
                      onClick={() => setActive(employee, true)}
                    >
                      <RotateCcw size={13} /> {t("modules.restoreEmployee")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">{loading ? t("common.loading") : t("modules.noEmployees")}</div>
        )}
      </div>

      {showForm && (
        <EmployeeForm
          contacts={linkableContacts}
          close={() => setShowForm(false)}
          saved={() => {
            setShowForm(false);
            if (tab !== "active") setTab("active");
            load();
            onNotice(t("common.saved"));
          }}
        />
      )}
    </section>
  );
}

function EmployeeForm({
  contacts,
  close,
  saved,
}: {
  contacts: Contact[];
  close: () => void;
  saved: () => void;
}) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [contactId, setContactId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api("/employees", {
        method: "POST",
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
          startDate,
          contactId: contactId || undefined,
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
    <Modal title={t("modules.employeeTitle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <div className="form-row">
          <label>
            {t("auth.fullName")}
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label>
            {t("common.phone")} <small>{t("common.optional")}</small>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t("modules.jobTitle")} <small>{t("common.optional")}</small>
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </label>
          <label>
            {t("modules.startDate")}
            <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        </div>
        <label>
          {t("modules.contact")} <small>{t("common.optional")}</small>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">—</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.name}</option>
            ))}
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
