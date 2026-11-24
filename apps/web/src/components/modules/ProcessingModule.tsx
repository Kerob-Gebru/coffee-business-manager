"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import Modal from "@/components/Modal";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtNumber, today } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ProcessingBatch } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

const STATUS_KEYS: Record<string, TranslationKey> = {
  planned: "modules.planned",
  running: "modules.running",
  completed: "modules.completed",
  cancelled: "modules.cancelled",
};

export default function ProcessingModule({ onNotice }: { onNotice: (message: string) => void }) {
  const { t, locale } = useTranslation();
  const [rows, setRows] = useState<ProcessingBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [completing, setCompleting] = useState<ProcessingBatch | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await api("/processing-batches");
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

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("modules.processing")}</h2>
          <p>{t("modules.subtitleProcessing")}</p>
        </div>
        <button className="primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> {t("modules.addBatch")}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("modules.batchCode")}</th>
              <th>{t("modules.method")}</th>
              <th className="right">{t("modules.inputQuantity")}</th>
              <th className="right">{t("modules.outputQuantity")}</th>
              <th className="right">{t("modules.wasteQuantity")}</th>
              <th>{t("common.status")}</th>
              <th>{t("modules.startedAt")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><b>{row.batchCode}</b></td>
                <td>{methodLabel(row.processingMethod, t)}</td>
                <td className="right amount">{fmtNumber(row.inputQuantity, locale, 3)}</td>
                <td className="right">{row.outputQuantity === null ? "—" : fmtNumber(row.outputQuantity, locale, 3)}</td>
                <td className="right">{row.wasteQuantity === null ? "—" : fmtNumber(row.wasteQuantity, locale, 3)}</td>
                <td><span className={`badge-status status-${row.status}`}>{t(STATUS_KEYS[row.status] ?? "common.status")}</span></td>
                <td>{fmtDate(row.startedAt, locale)}</td>
                <td>
                  {row.status === "planned" || row.status === "running" ? (
                    <button className="action-btn" onClick={() => setCompleting(row)}>
                      <Check size={13} /> {t("modules.completeBatch")}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">{loading ? t("common.loading") : t("modules.noBatches")}</div>
        )}
      </div>

      {showForm && (
        <BatchForm
          close={() => setShowForm(false)}
          saved={() => {
            setShowForm(false);
            load();
            onNotice(t("common.saved"));
          }}
        />
      )}

      {completing && (
        <CompleteForm
          batch={completing}
          close={() => setCompleting(null)}
          saved={() => {
            setCompleting(null);
            load();
            onNotice(t("common.saved"));
          }}
        />
      )}
    </section>
  );
}

function methodLabel(method: string | null, t: (key: TranslationKey) => string): string {
  if (!method) return "—";
  if (method === "washed") return t("modules.washed");
  if (method === "natural") return t("modules.natural");
  return t("modules.otherMethod");
}

function BatchForm({ close, saved }: { close: () => void; saved: () => void }) {
  const { t } = useTranslation();
  const [batchCode, setBatchCode] = useState("");
  const [inputQuantity, setInputQuantity] = useState("");
  const [processingMethod, setProcessingMethod] = useState("washed");
  const [startedAt, setStartedAt] = useState(today());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api("/processing-batches", {
        method: "POST",
        body: JSON.stringify({
          batchCode: batchCode.trim(),
          inputQuantity: inputQuantity.trim(),
          processingMethod,
          startedAt,
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
    <Modal title={t("modules.addBatchTitle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <div className="form-row">
          <label>
            {t("modules.batchCode")}
            <input required value={batchCode} onChange={(e) => setBatchCode(e.target.value)} />
          </label>
          <label>
            {t("modules.inputQuantity")}
            <input type="number" min="0.001" step="0.001" required value={inputQuantity} onChange={(e) => setInputQuantity(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t("modules.method")}
            <select value={processingMethod} onChange={(e) => setProcessingMethod(e.target.value)}>
              <option value="washed">{t("modules.washed")}</option>
              <option value="natural">{t("modules.natural")}</option>
              <option value="other">{t("modules.otherMethod")}</option>
            </select>
          </label>
          <label>
            {t("modules.startedAt")}
            <input type="date" required value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
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
            {busy ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CompleteForm({
  batch,
  close,
  saved,
}: {
  batch: ProcessingBatch;
  close: () => void;
  saved: () => void;
}) {
  const { t } = useTranslation();
  const [outputQuantity, setOutputQuantity] = useState(batch.outputQuantity ?? "");
  const [wasteQuantity, setWasteQuantity] = useState(batch.wasteQuantity ?? "");
  const [completedAt, setCompletedAt] = useState(today());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api(`/processing-batches/${batch.id}/complete`, {
        method: "PATCH",
        body: JSON.stringify({
          outputQuantity: outputQuantity.trim(),
          wasteQuantity: wasteQuantity.trim() || undefined,
          completedAt,
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
    <Modal title={t("modules.completeBatchTitle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <p className="form-note">
          {batch.batchCode} · {t("modules.inputQuantity")}: {batch.inputQuantity}
        </p>
        <div className="form-row">
          <label>
            {t("modules.outputQuantity")}
            <input type="number" min="0" step="0.001" required value={outputQuantity} onChange={(e) => setOutputQuantity(e.target.value)} />
          </label>
          <label>
            {t("modules.wasteQuantity")}
            <input type="number" min="0" step="0.001" value={wasteQuantity} onChange={(e) => setWasteQuantity(e.target.value)} />
          </label>
        </div>
        <label>
          {t("modules.completedAt")}
          <input type="date" required value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t("common.loading") : t("modules.completeBatch")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
