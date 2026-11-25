"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import DeleteAccountModal from "@/components/DeleteAccountModal";
import { api, apiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Company, SessionUser } from "@/lib/types";

export default function SettingsModule({
  user,
  onNotice,
  onCompanyChange,
  onRequestLogout,
}: {
  user: SessionUser | null;
  onNotice: (message: string) => void;
  onCompanyChange?: (company: Company) => void;
  onRequestLogout?: (mode: "current" | "all") => void;
}) {
  const { t } = useTranslation();
  const [company, setCompany] = useState<Company | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyError, setCompanyError] = useState("");
  const [companyBusy, setCompanyBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [sessionBusy, setSessionBusy] = useState<"current" | "others" | "all" | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await api("/company");
        if (response.ok) {
          const data: Company = await response.json();
          setCompany(data);
          setCompanyName(data?.name ?? "");
        }
      } catch {
        // The panel still renders with an empty name; saving will surface errors.
      }
    })();
  }, []);

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    setCompanyBusy(true);
    setCompanyError("");
    try {
      const response = await api("/company", {
        method: "PATCH",
        body: JSON.stringify({ name: companyName.trim() }),
      });
      if (!response.ok) {
        setCompanyError(await apiError(response, t("common.error")));
        return;
      }
      const data: Company = await response.json();
      setCompany(data);
      onCompanyChange?.(data);
      onNotice(t("settings.companyUpdated"));
    } catch {
      setCompanyError(t("common.error"));
    } finally {
      setCompanyBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError(t("settings.passwordMismatch"));
      return;
    }
    setPasswordBusy(true);
    setPasswordError("");
    try {
      const response = await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        setPasswordError(await apiError(response, t("settings.passwordError")));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onNotice(t("settings.passwordUpdated"));
    } catch {
      setPasswordError(t("settings.passwordError"));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function signOutCurrent() {
    if (onRequestLogout) {
      onRequestLogout("current");
      return;
    }
    setSessionBusy("current");
    setSessionError("");
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  async function signOutDevices(includeCurrent: boolean) {
    if (includeCurrent && onRequestLogout) {
      onRequestLogout("all");
      return;
    }
    setSessionBusy(includeCurrent ? "all" : "others");
    setSessionError("");
    try {
      const response = await api("/auth/logout-all", {
        method: "POST",
        body: JSON.stringify({ includeCurrent }),
      });
      if (!response.ok) {
        setSessionError(await apiError(response, t("settings.sessionsError")));
        return;
      }
      if (includeCurrent) {
        window.location.href = "/login";
        return;
      }
      onNotice(t("settings.signedOutOthers"));
    } catch {
      setSessionError(t("settings.sessionsError"));
    } finally {
      setSessionBusy(null);
    }
  }

  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t("settings.companyProfile")}</h2>
            <p>{t("settings.subtitle")}</p>
          </div>
        </div>
        <form onSubmit={saveCompany}>
          <label>
            {t("settings.companyName")}
            <input
              required
              minLength={2}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </label>
          <div className="form-note">
            {t("settings.workspaceId")}: #{user?.companyId ?? company?.id ?? "—"}
          </div>
          {companyError && <p className="error">{companyError}</p>}
          <div className="modal-actions">
            <button className="primary" disabled={companyBusy || companyName.trim().length < 2}>
              {companyBusy ? t("common.loading") : t("settings.saveCompany")}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t("settings.security")}</h2>
            <p>
              {t("settings.role")}: {user?.role ?? "—"}
            </p>
          </div>
        </div>
        <form onSubmit={changePassword}>
          <label>
            {t("settings.currentPassword")}
            <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
          <label>
            {t("settings.newPassword")}
            <input type="password" required minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <label>
            {t("settings.confirmPassword")}
            <input type="password" required minLength={10} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </label>
          <div className="form-note">{t("settings.passwordHint")}</div>
          {passwordError && <p className="error">{passwordError}</p>}
          <div className="modal-actions">
            <button className="primary" disabled={passwordBusy}>
              {passwordBusy ? t("common.loading") : t("settings.changePassword")}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t("settings.sessionsTitle")}</h2>
            <p>{t("settings.sessionsDesc")}</p>
          </div>
        </div>
        <div className="session-actions">
          <button
            type="button"
            className="secondary"
            disabled={sessionBusy !== null}
            onClick={signOutCurrent}
          >
            {sessionBusy === "current" ? t("common.loading") : t("settings.signOutThisDevice")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={sessionBusy !== null}
            onClick={() => signOutDevices(false)}
          >
            {sessionBusy === "others" ? t("common.loading") : t("settings.signOutOtherDevices")}
          </button>
          <button
            type="button"
            className="danger-btn"
            disabled={sessionBusy !== null}
            onClick={() => signOutDevices(true)}
          >
            {sessionBusy === "all" ? t("common.loading") : t("settings.signOutAllDevices")}
          </button>
        </div>
        {sessionError && <p className="error">{sessionError}</p>}
      </section>

      <section className="panel danger-panel">
        <div className="panel-head">
          <div>
            <h2 className="danger-text">{t("settings.deleteAccountTitle")}</h2>
            <p>{t("settings.deleteAccountDesc")}</p>
          </div>
        </div>
        <div className="danger-note">
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <p>{t("settings.deleteAccountWarning")}</p>
        </div>
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="danger-btn"
            onClick={() => setShowDeleteAccount(true)}
          >
            <Trash2 size={15} />
            {t("settings.deleteAccountButton")}
          </button>
        </div>
      </section>

      {showDeleteAccount && (
        <DeleteAccountModal
          user={user}
          close={() => setShowDeleteAccount(false)}
        />
      )}
    </div>
  );
}
