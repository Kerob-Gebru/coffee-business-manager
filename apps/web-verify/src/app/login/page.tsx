"use client";

import { useState } from "react";
import { Coffee } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { Language } from "@/lib/i18n";
import { api, apiError } from "@/lib/api";

type Mode = "signIn" | "register" | "forgot";

export default function LoginPage() {
  const { language, setLanguage, t, languages } = useTranslation();
  const [mode, setMode] = useState<Mode>("signIn");

  return (
    <main className="login-wrap">
      <div className="login-card">
        <div className="login-top">
          <div className="brand-mark">
            <Coffee size={26} />
          </div>
          <select
            className="login-lang-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            aria-label={t("common.language")}
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName}
              </option>
            ))}
          </select>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === "signIn" ? "active" : ""}`}
            onClick={() => setMode("signIn")}
          >
            {t("auth.signInTab")}
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => setMode("register")}
          >
            {t("auth.registerTab")}
          </button>
        </div>

        {mode === "signIn" && <SignInForm onForgot={() => setMode("forgot")} />}
        {mode === "register" && <RegisterForm onSignIn={() => setMode("signIn")} />}
        {mode === "forgot" && <ForgotForm onSignIn={() => setMode("signIn")} />}
      </div>
    </main>
  );
}

function SignInForm({ onForgot }: { onForgot: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        setError(await apiError(response, t("auth.loginFailed")));
        return;
      }
      window.location.href = "/";
    } catch {
      setError(t("auth.unableToSignIn"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <h1>{t("auth.welcomeBack")}</h1>
      <p>{t("auth.signInSubtitle")}</p>
      <label>
        {t("auth.email")}
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        {t("auth.password")}
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <div className="error">{error}</div>}
      <button className="primary full" disabled={busy}>
        {busy ? t("auth.signingIn") : t("auth.signIn")}
      </button>
      <button type="button" className="link-btn" onClick={onForgot}>
        {t("auth.forgotLink")}
      </button>
    </form>
  );
}

function RegisterForm({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          companyName: companyName.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        }),
      });
      if (!response.ok) {
        setError(await apiError(response, t("auth.registerFailed")));
        return;
      }
      window.location.href = "/";
    } catch {
      setError(t("auth.registerFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <h1>{t("auth.createWorkspace")}</h1>
      <p>{t("auth.createSubtitle")}</p>
      <label>
        {t("auth.companyName")}
        <input
          required
          minLength={2}
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </label>
      <label>
        {t("auth.fullName")}
        <input
          required
          minLength={2}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </label>
      <label>
        {t("auth.email")}
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        {t("auth.password")}
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <small>{t("auth.passwordHint")}</small>
      </label>
      <label>
        {t("auth.confirmPassword")}
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </label>
      {error && <div className="error">{error}</div>}
      <button className="primary full" disabled={busy}>
        {busy ? t("auth.creating") : t("auth.createAccount")}
      </button>
      <div className="auth-switch">
        {t("auth.haveAccount")}{" "}
        <button type="button" className="link-btn" onClick={onSignIn}>
          {t("auth.signIn")}
        </button>
      </div>
    </form>
  );
}

function ForgotForm({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [devToken, setDevToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"request" | "reset">("request");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestToken(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) {
        setError(await apiError(response, t("auth.resetFailed")));
        return;
      }
      const data = await response.json();
      setInfo(t("auth.resetSent"));
      if (typeof data.devResetToken === "string") {
        setDevToken(data.devResetToken);
        setToken(data.devResetToken);
      }
      setStep("reset");
    } catch {
      setError(t("auth.resetFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: token.trim(), newPassword }),
      });
      if (!response.ok) {
        setError(await apiError(response, t("auth.resetFailed")));
        return;
      }
      onSignIn();
    } catch {
      setError(t("auth.resetFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={step === "request" ? requestToken : resetPassword} className="auth-form">
      <h1>{step === "request" ? t("auth.forgotTitle") : t("auth.resetTitle")}</h1>
      <p>{step === "request" ? t("auth.forgotSubtitle") : t("auth.resetSubtitle")}</p>

      {step === "request" ? (
        <label>
          {t("auth.email")}
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      ) : (
        <>
          {info && <div className="notice-success">{info}</div>}
          <label>
            {t("auth.resetToken")}
            <input
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              pattern="[a-f0-9]{64}"
            />
            {devToken && <small>{t("auth.tokenHint")}</small>}
          </label>
          <label>
            {t("auth.newPassword")}
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <small>{t("auth.passwordHint")}</small>
          </label>
          <label>
            {t("auth.confirmPassword")}
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
        </>
      )}

      {error && <div className="error">{error}</div>}
      <button className="primary full" disabled={busy}>
        {busy
          ? step === "request"
            ? t("auth.sending")
            : t("auth.resetting")
          : step === "request"
            ? t("auth.sendReset")
            : t("auth.resetPassword")}
      </button>
      <button type="button" className="link-btn" onClick={onSignIn}>
        {t("auth.backToSignIn")}
      </button>
    </form>
  );
}
