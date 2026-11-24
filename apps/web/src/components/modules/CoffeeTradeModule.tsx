"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import Modal from "@/components/Modal";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtNumber, today } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { CoffeeTrade, Contact } from "@/lib/types";

export default function CoffeeTradeModule({
  contacts,
  onNotice,
}: {
  contacts: Contact[];
  onNotice: (message: string) => void;
}) {
  const { t, locale } = useTranslation();
  const [rows, setRows] = useState<CoffeeTrade[]>([]);
  const [filter, setFilter] = useState<"all" | "purchase" | "sale">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const activeContacts = useMemo(
    () => contacts.filter((c) => c.isActive !== false),
    [contacts]
  );

  async function load() {
    setLoading(true);
    try {
      const response = await api("/coffee-trades");
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
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.tradeType === filter)),
    [rows, filter]
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("modules.coffeeTrade")}</h2>
          <p>{t("modules.subtitleCoffee")}</p>
        </div>
        <button className="primary" onClick={() => setShowForm(true)} disabled={!activeContacts.length}>
          <Plus size={16} /> {t("modules.addCoffeeTrade")}
        </button>
      </div>

      <div className="filter-tabs">
        <button className={`filter-tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          {t("common.all")}
        </button>
        <button className={`filter-tab ${filter === "purchase" ? "active" : ""}`} onClick={() => setFilter("purchase")}>
          {t("modules.purchase")}
        </button>
        <button className={`filter-tab ${filter === "sale" ? "active" : ""}`} onClick={() => setFilter("sale")}>
          {t("modules.sale")}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("modules.lotNumber")}</th>
              <th>{t("modules.grade")}</th>
              <th>{t("modules.tradeType")}</th>
              <th>{t("modules.contact")}</th>
              <th className="right">{t("modules.weightKg")}</th>
              <th className="right">{t("modules.moisturePct")}</th>
              <th>{t("modules.tradeDate")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td><b>{row.lotNumber}</b></td>
                <td>{row.grade}</td>
                <td>
                  <span className="kind">
                    {row.tradeType === "purchase" ? t("modules.purchase") : t("modules.sale")}
                  </span>
                </td>
                <td>{row.contactName || "—"}</td>
                <td className="right amount">{fmtNumber(row.weightKg, locale, 3)}</td>
                <td className="right">{row.moisturePct === null ? "—" : `${fmtNumber(row.moisturePct, locale)}%`}</td>
                <td>{fmtDate(row.tradeDate, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty">{loading ? t("common.loading") : t("modules.noCoffeeTrades")}</div>
        )}
      </div>

      {showForm && (
        <CoffeeTradeForm
          contacts={activeContacts}
          close={() => setShowForm(false)}
          saved={() => {
            setShowForm(false);
            load();
            onNotice(t("common.saved"));
          }}
        />
      )}
    </section>
  );
}

function CoffeeTradeForm({
  contacts,
  close,
  saved,
}: {
  contacts: Contact[];
  close: () => void;
  saved: () => void;
}) {
  const { t } = useTranslation();
  const [lotNumber, setLotNumber] = useState("");
  const [grade, setGrade] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [moisturePct, setMoisturePct] = useState("");
  const [contactId, setContactId] = useState(contacts[0] ? String(contacts[0].id) : "");
  const [tradeType, setTradeType] = useState("purchase");
  const [tradeDate, setTradeDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api("/coffee-trades", {
        method: "POST",
        body: JSON.stringify({
          lotNumber: lotNumber.trim(),
          grade: grade.trim(),
          weightKg: weightKg.trim(),
          moisturePct: moisturePct.trim(),
          contactId,
          tradeType,
          tradeDate,
          notes: notes.trim() || undefined,
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
    <Modal title={t("modules.addCoffeeTrade")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <div className="form-row">
          <label>
            {t("modules.lotNumber")}
            <input required value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
          </label>
          <label>
            {t("modules.grade")}
            <input required value={grade} onChange={(e) => setGrade(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t("modules.weightKg")}
            <input type="number" min="0.001" step="0.001" required value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
          </label>
          <label>
            {t("modules.moisturePct")}
            <input type="number" min="0" max="100" step="0.01" required value={moisturePct} onChange={(e) => setMoisturePct(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t("modules.tradeType")}
            <select value={tradeType} onChange={(e) => setTradeType(e.target.value)}>
              <option value="purchase">{t("modules.purchase")}</option>
              <option value="sale">{t("modules.sale")}</option>
            </select>
          </label>
          <label>
            {t("modules.tradeDate")}
            <input type="date" required value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
          </label>
        </div>
        <label>
          {t("modules.contact")}
          <select required value={contactId} onChange={(e) => setContactId(e.target.value)}>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t("common.notes")} <small>{t("common.optional")}</small>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
