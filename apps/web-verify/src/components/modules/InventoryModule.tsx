"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import Modal from "@/components/Modal";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtNumber, today } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { InventoryItem, StockMovement } from "@/lib/types";

export default function InventoryModule({ onNotice }: { onNotice: (message: string) => void }) {
  const { t, locale } = useTranslation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showItemForm, setShowItemForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await api("/inventory");
      if (!response.ok) {
        setError(await apiError(response, t("common.error")));
        return;
      }
      setItems(await response.json());
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  async function loadMovements(item: InventoryItem) {
    setSelected(item);
    try {
      const response = await api(`/inventory/${item.id}/movements`);
      if (response.ok) setMovements(await response.json());
      else setMovements([]);
    } catch {
      setMovements([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = items.find((item) => item.id === selected?.id);
    if (next) setSelected(next);
  }, [items, selected?.id]);

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t("modules.inventory")}</h2>
            <p>{t("modules.subtitleInventory")}</p>
          </div>
          <button className="primary" onClick={() => setShowItemForm(true)}>
            <Plus size={16} /> {t("modules.addItem")}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("modules.itemName")}</th>
                <th>{t("modules.warehouse")}</th>
                <th className="right">{t("modules.bagCount")}</th>
                <th className="right">{t("modules.totalWeight")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={selected?.id === item.id ? "row-selected" : undefined}>
                  <td><b>{item.itemName}</b></td>
                  <td>{item.warehouseLocation}</td>
                  <td className="right amount">{item.bagCount}</td>
                  <td className="right">{fmtNumber(item.totalWeightKg, locale, 3)}</td>
                  <td>
                    <button className="action-btn" onClick={() => loadMovements(item)}>
                      <ArrowLeftRight size={13} /> {t("modules.movements")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && (
            <div className="empty">{loading ? t("common.loading") : t("modules.noItems")}</div>
          )}
        </div>
      </section>

      {selected && (
        <section className="panel sub-panel">
          <div className="panel-head">
            <div>
              <h2>{selected.itemName} · {t("modules.movements")}</h2>
              <p>
                {t("modules.bagCount")}: {selected.bagCount} · {t("modules.totalWeight")}:{" "}
                {fmtNumber(selected.totalWeightKg, locale, 3)}
              </p>
            </div>
            <button className="secondary" onClick={() => setShowMovementForm(true)}>
              <Plus size={16} /> {t("modules.addMovement")}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("modules.movementDate")}</th>
                  <th>{t("modules.direction")}</th>
                  <th className="right">{t("modules.bagQuantity")}</th>
                  <th className="right">{t("modules.weightKg")}</th>
                  <th>{t("modules.reference")}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{fmtDate(movement.movementDate, locale)}</td>
                    <td>
                      <span className={`badge-status status-${movement.direction}`}>
                        {movement.direction === "in" ? t("modules.received") : t("modules.issued")}
                      </span>
                    </td>
                    <td className="right amount">{movement.bagQuantity}</td>
                    <td className="right">{fmtNumber(movement.weightKg, locale, 3)}</td>
                    <td>{movement.reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!movements.length && <div className="empty">{t("modules.noMovements")}</div>}
          </div>
        </section>
      )}

      {showItemForm && (
        <ItemForm
          close={() => setShowItemForm(false)}
          saved={() => {
            setShowItemForm(false);
            load();
            onNotice(t("common.saved"));
          }}
        />
      )}

      {showMovementForm && selected && (
        <MovementForm
          item={selected}
          close={() => setShowMovementForm(false)}
          saved={() => {
            setShowMovementForm(false);
            load();
            loadMovements(selected);
            onNotice(t("common.saved"));
          }}
        />
      )}
    </>
  );
}

function ItemForm({ close, saved }: { close: () => void; saved: () => void }) {
  const { t } = useTranslation();
  const [itemName, setItemName] = useState("");
  const [warehouseLocation, setWarehouseLocation] = useState("");
  const [bagCount, setBagCount] = useState("0");
  const [totalWeightKg, setTotalWeightKg] = useState("0");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api("/inventory", {
        method: "POST",
        body: JSON.stringify({
          itemName: itemName.trim(),
          warehouseLocation: warehouseLocation.trim(),
          bagCount,
          totalWeightKg: totalWeightKg.trim(),
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
    <Modal title={t("modules.addItem")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <label>
          {t("modules.itemName")}
          <input required value={itemName} onChange={(e) => setItemName(e.target.value)} />
        </label>
        <label>
          {t("modules.warehouse")}
          <input required value={warehouseLocation} onChange={(e) => setWarehouseLocation(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            {t("modules.bagCount")}
            <input type="number" min="0" step="1" required value={bagCount} onChange={(e) => setBagCount(e.target.value)} />
          </label>
          <label>
            {t("modules.totalWeight")}
            <input type="number" min="0" step="0.001" required value={totalWeightKg} onChange={(e) => setTotalWeightKg(e.target.value)} />
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

function MovementForm({
  item,
  close,
  saved,
}: {
  item: InventoryItem;
  close: () => void;
  saved: () => void;
}) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState("in");
  const [bagQuantity, setBagQuantity] = useState("0");
  const [weightKg, setWeightKg] = useState("");
  const [movementDate, setMovementDate] = useState(today());
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api(`/inventory/${item.id}/movements`, {
        method: "POST",
        body: JSON.stringify({
          direction,
          bagQuantity,
          weightKg: weightKg.trim(),
          movementDate,
          reference: reference.trim() || undefined,
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
    <Modal title={t("modules.movementTitle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <p className="form-note">{item.itemName} · {item.warehouseLocation}</p>
        <div className="form-row">
          <label>
            {t("modules.direction")}
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="in">{t("modules.received")}</option>
              <option value="out">{t("modules.issued")}</option>
            </select>
          </label>
          <label>
            {t("modules.movementDate")}
            <input type="date" required value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t("modules.bagQuantity")}
            <input type="number" min="0" step="1" required value={bagQuantity} onChange={(e) => setBagQuantity(e.target.value)} />
          </label>
          <label>
            {t("modules.weightKg")}
            <input type="number" min="0.001" step="0.001" required value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
          </label>
        </div>
        <label>
          {t("modules.reference")} <small>{t("common.optional")}</small>
          <input value={reference} onChange={(e) => setReference(e.target.value)} />
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
