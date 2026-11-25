"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "@/components/Modal";
import { api, apiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { SessionUser } from "@/lib/types";

export default function DeleteAccountModal({
  user,
  close,
}: {
  user: SessionUser | null;
  close: () => void;
}) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) return;
    setBusy(true);
    setError("");

    try {
      const response = await api("/auth/delete-account", {
        method: "POST",
        body: JSON.stringify({ currentPassword }),
      });

      if (!response.ok) {
        setError(await apiError(response, t("settings.deleteAccountError")));
        setBusy(false);
        return;
      }

      window.location.href = "/login?deleted=1";
    } catch {
      setError(t("settings.deleteAccountError"));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("settings.deleteAccountConfirmTitle")}
      close={busy ? () => undefined : close}
      closeAriaLabel={t("common.close")}
    >
      <form onSubmit={submit}>
        <div className="danger-note">
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>{user?.email || "—"}</strong>
            <p>{t("settings.deleteAccountConfirmDesc")}</p>
          </div>
        </div>

        <label>
          {t("settings.deleteAccountPasswordLabel")}
          <input
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="danger-btn" disabled={busy || !currentPassword}>
            {busy ? t("common.loading") : t("settings.deleteAccountConfirmButton")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
