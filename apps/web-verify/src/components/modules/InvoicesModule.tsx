"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, Eye, Plus, Receipt } from "lucide-react";
import Modal from "@/components/Modal";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtMoney, today } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Contact, Invoice, InvoiceDetail } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

const STATUS_KEYS: Record<string, TranslationKey> = {
  draft: "invoices.draft",
  sent: "invoices.sent",
  partially_paid: "invoices.partiallyPaid",
  paid: "invoices.paid",
  cancelled: "invoices.cancelled",
};

export default function InvoicesModule({
  contacts,
  onNotice,
}: {
  contacts: Contact[];
  onNotice: (message: string) => void;
}) {
  const { t, locale } = useTranslation();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [cancelling, setCancelling] = useState<Invoice | null>(null);

  const activeContacts = useMemo(
    () => contacts.filter((contact) => contact.isActive !== false),
    [contacts]
  );

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (overdueOnly) params.set("overdue", "true");
      const query = params.toString();
      const response = await api(`/invoices${query ? `?${query}` : ""}`);
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
  }, [status, overdueOnly]);

  async function openDetail(invoice: Invoice) {
    setDetailLoading(true);
    try {
      const response = await api(`/invoices/${invoice.id}`);
      if (response.ok) setDetail(await response.json());
      else setError(await apiError(response, t("invoices.actionError")));
    } catch {
      setError(t("invoices.actionError"));
    } finally {
      setDetailLoading(false);
    }
  }

  async function markSent(invoice: Invoice) {
    try {
      const response = await api(`/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "sent" }),
      });
      if (!response.ok) {
        setError(await apiError(response, t("invoices.actionError")));
        return;
      }
      await load();
      if (detail?.id === invoice.id) await openDetail(invoice);
      onNotice(t("invoices.sentToast"));
    } catch {
      setError(t("invoices.actionError"));
    }
  }

  async function cancel(invoice: Invoice) {
    try {
      const response = await api(`/invoices/${invoice.id}/cancel`, { method: "POST" });
      if (!response.ok) {
        setError(await apiError(response, t("invoices.actionError")));
        return;
      }
      setCancelling(null);
      setDetail(null);
      await load();
      onNotice(t("invoices.cancelledToast"));
    } catch {
      setError(t("invoices.actionError"));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("invoices.title")}</h2>
          <p>{t("invoices.subtitle")}</p>
        </div>
        <button className="primary" onClick={() => setShowForm(true)} disabled={!activeContacts.length}>
          <Plus size={16} /> {t("invoices.addInvoice")}
        </button>
      </div>

      <div className="filter-tabs">
        <select
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t("invoices.status")}
        >
          <option value="">{t("invoices.allStatuses")}</option>
          <option value="draft">{t("invoices.draft")}</option>
          <option value="sent">{t("invoices.sent")}</option>
          <option value="partially_paid">{t("invoices.partiallyPaid")}</option>
          <option value="paid">{t("invoices.paid")}</option>
          <option value="cancelled">{t("invoices.cancelled")}</option>
        </select>
        <button
          className={`filter-tab ${overdueOnly ? "active" : ""}`}
          onClick={() => setOverdueOnly((value) => !value)}
        >
          {t("invoices.overdueOnly")}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("invoices.invoiceNumber")}</th>
              <th>{t("invoices.partyType")}</th>
              <th>{t("invoices.contact")}</th>
              <th>{t("invoices.issueDate")}</th>
              <th>{t("invoices.dueDate")}</th>
              <th>{t("invoices.status")}</th>
              <th className="right">{t("invoices.totalAmount")}</th>
              <th className="right">{t("invoices.outstanding")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((invoice) => (
              <tr key={invoice.id}>
                <td><b>{invoice.invoiceNumber}</b></td>
                <td>{invoice.partyType === "customer" ? t("invoices.customer") : t("invoices.supplier")}</td>
                <td>{invoice.contactName || "—"}</td>
                <td>{fmtDate(invoice.issueDate, locale)}</td>
                <td>{fmtDate(invoice.dueDate, locale)}</td>
                <td>
                  <span className={`badge-status status-${invoice.status}`}>
                    {t(STATUS_KEYS[invoice.status] ?? "invoices.status")}
                  </span>
                </td>
                <td className="right amount">{fmtMoney(invoice.totalAmount, invoice.currency, locale)}</td>
                <td className="right">{fmtMoney(invoice.outstandingBalance, invoice.currency, locale)}</td>
                <td>
                  <div className="row-actions">
                    <button className="action-btn" onClick={() => openDetail(invoice)}>
                      <Eye size={13} /> {t("invoices.details")}
                    </button>
                    {invoice.status !== "paid" && invoice.status !== "cancelled" && (
                      <button className="action-btn" onClick={() => setPaying(invoice)}>
                        <Receipt size={13} /> {t("invoices.recordPayment")}
                      </button>
                    )}
                    {invoice.status === "draft" && (
                      <button className="action-btn" onClick={() => markSent(invoice)}>
                        <CheckCircle2 size={13} /> {t("invoices.markSent")}
                      </button>
                    )}
                    {invoice.status !== "paid" && invoice.status !== "cancelled" && (
                      <button className="action-btn danger" onClick={() => setCancelling(invoice)}>
                        <Ban size={13} /> {t("invoices.cancelInvoice")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">{loading ? t("common.loading") : t("invoices.noInvoices")}</div>
        )}
      </div>

      {showForm && (
        <InvoiceForm
          contacts={activeContacts}
          close={() => setShowForm(false)}
          saved={() => {
            setShowForm(false);
            load();
            onNotice(t("invoices.saved"));
          }}
        />
      )}

      {detail && (
        <InvoiceDetailModal
          invoice={detail}
          loading={detailLoading}
          close={() => setDetail(null)}
          onPayment={() => setPaying(detail)}
          onSent={() => markSent(detail)}
          onCancel={() => setCancelling(detail)}
        />
      )}

      {paying && (
        <PaymentForm
          invoice={paying}
          close={() => setPaying(null)}
          saved={() => {
            setPaying(null);
            load();
            if (detail) openDetail(detail);
            onNotice(t("invoices.paymentSaved"));
          }}
        />
      )}

      {cancelling && (
        <Modal
          title={t("invoices.cancelInvoice")}
          close={() => setCancelling(null)}
          closeAriaLabel={t("common.close")}
        >
          <p className="confirm-msg">
            {t("invoices.cancelConfirm")} · {cancelling.invoiceNumber}
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setCancelling(null)}>
              {t("common.cancel")}
            </button>
            <button className="danger-btn" onClick={() => cancel(cancelling)}>
              {t("invoices.cancelInvoice")}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function InvoiceDetailModal({
  invoice,
  loading,
  close,
  onPayment,
  onSent,
  onCancel,
}: {
  invoice: InvoiceDetail;
  loading: boolean;
  close: () => void;
  onPayment: () => void;
  onSent: () => void;
  onCancel: () => void;
}) {
  const { t, locale } = useTranslation();
  const isOpen = invoice.status !== "paid" && invoice.status !== "cancelled";

  return (
    <Modal title={t("invoices.details")} close={close} closeAriaLabel={t("common.close")} wide>
      <div className="detail-grid">
        <div>
          <small>{t("invoices.invoiceNumber")}</small>
          <strong>{invoice.invoiceNumber}</strong>
        </div>
        <div>
          <small>{t("invoices.status")}</small>
          <strong>{t(STATUS_KEYS[invoice.status] ?? "invoices.status")}</strong>
        </div>
        <div>
          <small>{t("invoices.partyType")}</small>
          <strong>{invoice.partyType === "customer" ? t("invoices.customer") : t("invoices.supplier")}</strong>
        </div>
        <div>
          <small>{t("invoices.contact")}</small>
          <strong>{invoice.contact?.name || invoice.contactName || "—"}</strong>
        </div>
        <div>
          <small>{t("invoices.issueDate")}</small>
          <strong>{fmtDate(invoice.issueDate, locale)}</strong>
        </div>
        <div>
          <small>{t("invoices.dueDate")}</small>
          <strong>{fmtDate(invoice.dueDate, locale)}</strong>
        </div>
        <div>
          <small>{t("invoices.subtotal")}</small>
          <strong>{fmtMoney(invoice.subtotal, invoice.currency, locale)}</strong>
        </div>
        <div>
          <small>{t("invoices.tax")}</small>
          <strong>{fmtMoney(invoice.taxAmount, invoice.currency, locale)}</strong>
        </div>
        <div>
          <small>{t("invoices.totalAmount")}</small>
          <strong>{fmtMoney(invoice.totalAmount, invoice.currency, locale)}</strong>
        </div>
        <div>
          <small>{t("invoices.amountPaid")}</small>
          <strong>{fmtMoney(invoice.amountPaid, invoice.currency, locale)}</strong>
        </div>
        <div>
          <small>{t("invoices.outstanding")}</small>
          <strong>{fmtMoney(invoice.outstandingBalance, invoice.currency, locale)}</strong>
        </div>
      </div>

      {invoice.notes && <p className="form-note">{invoice.notes}</p>}

      <h3 className="sub-title">{t("invoices.payments")}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("invoices.paidAt")}</th>
              <th>{t("invoices.paymentMethod")}</th>
              <th>{t("invoices.reference")}</th>
              <th className="right">{t("invoices.paymentAmount")}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.payments.map((payment) => (
              <tr key={payment.id}>
                <td>{fmtDate(payment.paidAt, locale)}</td>
                <td>{paymentMethodLabel(payment.paymentMethod, t)}</td>
                <td>{payment.reference || "—"}</td>
                <td className="right amount">{fmtMoney(payment.amount, invoice.currency, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!invoice.payments.length && <div className="empty">{t("invoices.noPayments")}</div>}
      </div>

      <div className="modal-actions">
        {invoice.status === "draft" && (
          <button className="secondary" onClick={onSent} disabled={loading}>
            {t("invoices.markSent")}
          </button>
        )}
        {isOpen && (
          <>
            <button className="secondary danger-text" onClick={onCancel} disabled={loading}>
              {t("invoices.cancelInvoice")}
            </button>
            <button className="primary" onClick={onPayment} disabled={loading}>
              {t("invoices.recordPayment")}
            </button>
          </>
        )}
        <button className="secondary" onClick={close}>
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}

function paymentMethodLabel(method: string | null, t: (key: TranslationKey) => string): string {
  if (method === "cash") return t("invoices.cash");
  if (method === "bank_transfer") return t("invoices.bankTransfer");
  if (method) return t("invoices.otherMethod");
  return "—";
}

function InvoiceForm({
  contacts,
  close,
  saved,
}: {
  contacts: Contact[];
  close: () => void;
  saved: () => void;
}) {
  const { t } = useTranslation();
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [partyType, setPartyType] = useState("customer");
  const [contactId, setContactId] = useState(contacts[0] ? String(contacts[0].id) : "");
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  });
  const [currency, setCurrency] = useState("ETB");
  const [subtotal, setSubtotal] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api("/invoices", {
        method: "POST",
        body: JSON.stringify({
          invoiceNumber: invoiceNumber.trim(),
          partyType,
          contactId,
          issueDate,
          dueDate,
          currency,
          subtotal: subtotal.trim(),
          taxAmount: taxAmount.trim() || "0",
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
    <Modal title={t("invoices.createTitle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <div className="form-row">
          <label>
            {t("invoices.invoiceNumber")}
            <input required value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </label>
          <label>
            {t("invoices.partyType")}
            <select value={partyType} onChange={(e) => setPartyType(e.target.value)}>
              <option value="customer">{t("invoices.customer")}</option>
              <option value="supplier">{t("invoices.supplier")}</option>
            </select>
          </label>
        </div>
        <label>
          {t("invoices.contact")}
          <select required value={contactId} onChange={(e) => setContactId(e.target.value)}>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.name}</option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            {t("invoices.issueDate")}
            <input type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </label>
          <label>
            {t("invoices.dueDate")}
            <input type="date" required min={issueDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t("invoices.subtotal")}
            <input type="number" min="0" step="0.01" required value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
          </label>
          <label>
            {t("invoices.tax")}
            <input type="number" min="0" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
          </label>
        </div>
        <label>
          {t("finance.currency")}
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="ETB">ETB</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label>
          {t("invoices.notes")} <small>{t("common.optional")}</small>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <p className="form-note">{t("invoices.saved")}</p>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t("common.loading") : t("invoices.saveInvoice")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentForm({
  invoice,
  close,
  saved,
}: {
  invoice: Invoice;
  close: () => void;
  saved: () => void;
}) {
  const { t, locale } = useTranslation();
  const [amount, setAmount] = useState(invoice.outstandingBalance);
  const [paidAt, setPaidAt] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState(invoice.invoiceNumber);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api(`/invoices/${invoice.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: amount.trim(),
          paidAt,
          paymentMethod,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setError(await apiError(response, t("invoices.actionError")));
        setBusy(false);
        return;
      }
      saved();
    } catch {
      setError(t("invoices.actionError"));
      setBusy(false);
    }
  }

  return (
    <Modal title={t("invoices.paymentTitle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <p className="form-note">
          {invoice.invoiceNumber} · {t("invoices.outstanding")}:{" "}
          {fmtMoney(invoice.outstandingBalance, invoice.currency, locale)}
        </p>
        <div className="form-row">
          <label>
            {t("invoices.paymentAmount")}
            <input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            {t("invoices.paidAt")}
            <input type="date" required value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t("invoices.paymentMethod")}
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">{t("invoices.cash")}</option>
              <option value="bank_transfer">{t("invoices.bankTransfer")}</option>
              <option value="other">{t("invoices.otherMethod")}</option>
            </select>
          </label>
          <label>
            {t("invoices.reference")}
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>
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
            {busy ? t("common.loading") : t("invoices.savePayment")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
