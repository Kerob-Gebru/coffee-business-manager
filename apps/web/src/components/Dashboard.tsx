"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Calendar,
  Coffee,
  LayoutDashboard,
  Users,
  Wallet,
  Package,
  Truck,
  Settings,
  Sun,
  Moon,
  Search,
  Plus,
  LogOut,
  CircleDollarSign,
  Edit2,
  Archive,
  RotateCcw,
  Receipt,
  Calculator,
  ArrowLeftRight,
  ChevronRight,
  Trash2,
  User,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { Language, TranslationKey } from "@/lib/i18n";
import { api, apiError } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import Modal from "@/components/Modal";
import DeleteAccountModal from "@/components/DeleteAccountModal";
import CoffeeTradeModule from "@/components/modules/CoffeeTradeModule";
import ProcessingModule from "@/components/modules/ProcessingModule";
import InventoryModule from "@/components/modules/InventoryModule";
import VehiclesModule from "@/components/modules/VehiclesModule";
import EmployeesModule from "@/components/modules/EmployeesModule";
import InvoicesModule from "@/components/modules/InvoicesModule";
import ReportsModule from "@/components/modules/ReportsModule";
import SettingsModule from "@/components/modules/SettingsModule";
import CalculatorModule from "@/components/modules/CalculatorModule";
import CalendarModule from "@/components/modules/CalendarModule";
import ExchangeRateModule from "@/components/modules/ExchangeRateModule";
import ExchangeRateWidget from "@/components/modules/ExchangeRateWidget";
import type { Contact, SessionUser, Tx } from "@/lib/types";

const NAV_ITEMS = [
  { id: "Dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { id: "Contacts", labelKey: "nav.contacts", icon: Users },
  { id: "Finance", labelKey: "nav.finance", icon: Wallet },
  { id: "Invoices", labelKey: "nav.invoices", icon: Receipt },
  { id: "Calculator", labelKey: "nav.calculator", icon: Calculator },
  { id: "Calendar", labelKey: "nav.calendar", icon: Calendar },
  { id: "Exchange Rate", labelKey: "nav.exchangeRate", icon: ArrowLeftRight },
  { id: "Coffee Trade", labelKey: "nav.coffeeTrade", icon: Coffee },
  { id: "Processing", labelKey: "nav.processing", icon: Activity },
  { id: "Inventory", labelKey: "nav.inventory", icon: Package },
  { id: "Vehicles", labelKey: "nav.vehicles", icon: Truck },
  { id: "Employees", labelKey: "nav.employees", icon: Users },
  { id: "Reports", labelKey: "nav.reports", icon: CircleDollarSign },
  { id: "Settings", labelKey: "nav.settings", icon: Settings },
] as const;

const TAB_DESCRIPTIONS: Record<string, TranslationKey> = {
  Dashboard: "dashboard.description",
  Contacts: "contacts.subtitle",
  Finance: "finance.subtitle",
  Invoices: "invoices.subtitle",
  Calculator: "calculator.subtitle",
  Calendar: "calendar.subtitle",
  "Exchange Rate": "exchange.subtitle",
  "Coffee Trade": "modules.subtitleCoffee",
  Processing: "modules.subtitleProcessing",
  Inventory: "modules.subtitleInventory",
  Vehicles: "modules.subtitleVehicles",
  Employees: "modules.subtitleEmployees",
  Reports: "reports.subtitle",
  Settings: "settings.subtitle",
};

type FinanceSummary = {
  transactions: { income: number; expense: number };
  invoices: Array<{ partyType: string; status: string; outstanding: number }>;
};

export default function Dashboard() {
  const { language, setLanguage, t, locale, languages } = useTranslation();
  const [tab, setTab] = useState("Dashboard");
  const [dark, setDark] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [healthStatus, setHealthStatus] = useState<"checking" | "connected" | "db_unavailable" | "api_unavailable">("checking");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [query, setQuery] = useState("");
  const [showContact, setShowContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [archivingContact, setArchivingContact] = useState<Contact | null>(null);
  const [restoringContact, setRestoringContact] = useState<Contact | null>(null);
  const [contactTab, setContactTab] = useState<"active" | "archived">("active");
  const [showTx, setShowTx] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [logoutConfirmMode, setLogoutConfirmMode] = useState<"current" | "all" | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  function notify(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 3000);
  }

  function notifyAndRefresh(message: string) {
    notify(message);
    void load();
  }

  async function load() {
    try {
      const [h, m] = await Promise.all([api("/health"), api("/auth/me")]);
      const hd = await h.json();
      setHealthStatus(hd.database === "connected" ? "connected" : "db_unavailable");

      if (!m.ok) {
        window.location.href = "/login";
        return;
      }
      const md = await m.json();
      if (!md.user) {
        window.location.href = "/login";
        return;
      }
      setUser(md.user);
      setPermissions(Array.isArray(md.permissions) ? md.permissions : []);
      setCompanyName(md.company?.name ?? "");

      const [c, tRes, reportRes] = await Promise.all([
        api("/contacts?status=all"),
        api("/transactions"),
        api("/reports/finance"),
      ]);
      if (c.ok) setContacts(await c.json());
      if (tRes.ok) setTxs(await tRes.json());
      if (reportRes.ok) setSummary(await reportRes.json());
    } catch {
      setHealthStatus("api_unavailable");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function performLogout(mode: "current" | "all") {
    setLogoutBusy(true);
    try {
      if (mode === "all") {
        await api("/auth/logout-all", {
          method: "POST",
          body: JSON.stringify({ includeCurrent: true }),
        });
      } else {
        await api("/auth/logout", { method: "POST" });
      }
    } finally {
      setLogoutBusy(false);
      window.location.href = "/login";
    }
  }

  async function signOutOtherDevicesFromProfile() {
    setLogoutBusy(true);
    try {
      const response = await api("/auth/logout-all", {
        method: "POST",
        body: JSON.stringify({ includeCurrent: false }),
      });
      if (response.ok) {
        notify(t("settings.signedOutOthers"));
      } else {
        notify(t("settings.sessionsError"));
      }
    } catch {
      notify(t("settings.sessionsError"));
    } finally {
      setLogoutBusy(false);
    }
  }

  const currentNav = useMemo(() => NAV_ITEMS.find((n) => n.id === tab), [tab]);
  const currentTabLabel = currentNav ? t(currentNav.labelKey as TranslationKey) : tab;
  const currentDescription = TAB_DESCRIPTIONS[tab] ? t(TAB_DESCRIPTIONS[tab]) : t("dashboard.description");

  const healthText = useMemo(() => {
    switch (healthStatus) {
      case "connected":
        return t("common.connected");
      case "db_unavailable":
        return t("common.databaseUnavailable");
      case "api_unavailable":
        return t("common.apiUnavailable");
      case "checking":
      default:
        return t("common.checking");
    }
  }, [healthStatus, t]);

  const activeContacts = useMemo(
    () => contacts.filter((c) => c.isActive !== false),
    [contacts]
  );

  const archivedContacts = useMemo(
    () => contacts.filter((c) => c.isActive === false),
    [contacts]
  );

  const displayedContacts = useMemo(() => {
    const list = contactTab === "active" ? activeContacts : archivedContacts;
    if (!query.trim()) return list;
    return list.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  }, [contactTab, activeContacts, archivedContacts, query]);

  const owedToYou = useMemo(() => {
    if (!summary) return null;
    return summary.invoices
      .filter((row) => row.partyType === "customer" && row.status !== "cancelled")
      .reduce((total, row) => total + Number(row.outstanding), 0);
  }, [summary]);

  const youOwe = useMemo(() => {
    if (!summary) return null;
    return summary.invoices
      .filter((row) => row.partyType === "supplier" && row.status !== "cancelled")
      .reduce((total, row) => total + Number(row.outstanding), 0);
  }, [summary]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Coffee size={22} />
          </div>
          <div>
            <strong>{t("common.appName")}</strong>
            <small>{t("common.appSubtitle")}</small>
          </div>
        </div>

        <div className="workspace-label">{companyName || t("common.workspaceUpper")}</div>

        <nav>
          {NAV_ITEMS.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              onClick={() => {
                setTab(n.id);
                if (n.id === "Dashboard" && user) load();
              }}
            >
              <n.icon size={18} />
              <span>{t(n.labelKey as TranslationKey)}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="connection">
            <span className="status-dot" />
            <span>{healthText}</span>
          </div>
          <button
            className="nav-item"
            onClick={() => setLogoutConfirmMode("current")}
            title={t("nav.signOut")}
          >
            <LogOut size={18} />
            <span>{t("nav.signOut")}</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">
            <span>{t("common.workspace")}</span>
            <b>/</b>
            <strong>{currentTabLabel}</strong>
          </div>

          <div className="top-actions">
            <select
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

            <button
              className="icon-btn"
              onClick={() => setDark(!dark)}
              aria-label={t("common.toggleTheme")}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              type="button"
              className="profile-trigger"
              onClick={() => setShowProfile(true)}
              aria-label={t("profile.title")}
              title={t("profile.title")}
            >
              <div className="avatar">{user?.fullName?.slice(0, 1) || "A"}</div>
              <div className="user-meta">
                <strong>{user?.fullName || t("common.loading")}</strong>
                <small>{user?.role || ""}</small>
              </div>
            </button>

            <button
              className="icon-btn"
              onClick={() => setLogoutConfirmMode("current")}
              aria-label={t("nav.signOut")}
              title={t("nav.signOut")}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{t("common.overview")}</p>
              <h1>{currentTabLabel}</h1>
              <p className="muted">{currentDescription}</p>
            </div>
            {tab === "Dashboard" && (
              <div className="heading-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    setEditingContact(null);
                    setShowContact(true);
                  }}
                >
                  <Plus size={16} /> {t("dashboard.addContact")}
                </button>
                <button className="primary" onClick={() => setShowTx(true)}>
                  <Plus size={16} /> {t("dashboard.newRecord")}
                </button>
              </div>
            )}
          </div>

          {tab === "Dashboard" && (
            <>
              <div className="stats-grid">
                <Stat
                  icon={ArrowDownLeft}
                  label={t("dashboard.moneyOwedToYou")}
                  value={owedToYou === null ? "—" : fmtNumber(owedToYou, locale)}
                  hint={t("dashboard.receivablesHint")}
                />
                <Stat
                  icon={ArrowUpRight}
                  label={t("dashboard.moneyYouOwe")}
                  value={youOwe === null ? "—" : fmtNumber(youOwe, locale)}
                  hint={t("dashboard.payablesHint")}
                />
                <Stat
                  icon={Banknote}
                  label={t("dashboard.cashAndBank")}
                  value="—"
                  hint={t("dashboard.cashAndBankHint")}
                />
                <Stat
                  icon={Activity}
                  label={t("dashboard.recordsEntered")}
                  value={String(txs.length)}
                  hint={t("dashboard.recordsEnteredHint")}
                />
              </div>

              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>{t("dashboard.recentRecords")}</h2>
                      <p>{t("dashboard.recentRecordsDesc")}</p>
                    </div>
                    <button className="text-btn" onClick={() => setTab("Finance")}>
                      {t("common.viewAll")}
                    </button>
                  </div>
                  <Transactions rows={txs.slice(0, 6)} locale={locale} t={t} />
                </section>

                <section className="panel quick-panel">
                  <div className="panel-head">
                    <div>
                      <h2>{t("dashboard.quickActions")}</h2>
                      <p>{t("dashboard.quickActionsDesc")}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditingContact(null);
                      setShowContact(true);
                    }}
                  >
                    <Users size={18} />
                    <span>
                      <b>{t("dashboard.registerContact")}</b>
                      <small>{t("dashboard.registerContactDesc")}</small>
                    </span>
                    <Plus size={16} />
                  </button>
                  <button onClick={() => setShowTx(true)}>
                    <Wallet size={18} />
                    <span>
                      <b>{t("dashboard.recordMoneyMovement")}</b>
                      <small>{t("dashboard.recordMoneyMovementDesc")}</small>
                    </span>
                    <Plus size={16} />
                  </button>
                  <button onClick={() => setTab("Calculator")}>
                    <Calculator size={18} />
                    <span>
                      <b>{t("dashboard.openCalculator")}</b>
                      <small>{t("dashboard.openCalculatorDesc")}</small>
                    </span>
                    <Plus size={16} />
                  </button>
                  <button onClick={() => setTab("Calendar")}>
                    <Calendar size={18} />
                    <span>
                      <b>{t("dashboard.openCalendar")}</b>
                      <small>{t("dashboard.openCalendarDesc")}</small>
                    </span>
                    <Plus size={16} />
                  </button>
                  <button onClick={() => setTab("Exchange Rate")}>
                    <ArrowLeftRight size={18} />
                    <span>
                      <b>{t("dashboard.exchangeRate")}</b>
                      <small>{t("dashboard.exchangeRateDesc")}</small>
                    </span>
                    <Plus size={16} />
                  </button>
                  <div className="tip">
                    <b>{t("common.important")}</b>
                    <p>{t("dashboard.accountingTip")}</p>
                  </div>
                </section>
              </div>

              <ExchangeRateWidget onOpen={() => setTab("Exchange Rate")} />
            </>
          )}

          {tab === "Contacts" && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>{t("contacts.title")}</h2>
                  <p>{t("contacts.subtitle")}</p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setEditingContact(null);
                    setShowContact(true);
                  }}
                >
                  <Plus size={16} /> {t("contacts.addContact")}
                </button>
              </div>

              <div className="filter-tabs">
                <button
                  className={`filter-tab ${contactTab === "active" ? "active" : ""}`}
                  onClick={() => setContactTab("active")}
                >
                  {t("contacts.tabActive")} ({activeContacts.length})
                </button>
                <button
                  className={`filter-tab ${contactTab === "archived" ? "active" : ""}`}
                  onClick={() => setContactTab("archived")}
                >
                  {t("contacts.tabArchived")} ({archivedContacts.length})
                </button>
              </div>

              <div className="searchbox">
                <Search size={16} />
                <input
                  placeholder={t("contacts.searchPlaceholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("contacts.name")}</th>
                      <th>{t("contacts.phone")}</th>
                      <th>{t("contacts.roles")}</th>
                      <th>{t("contacts.recordId")}</th>
                      <th>{t("contacts.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedContacts.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <b>{c.name}</b>
                          {c.email && (
                            <small style={{ display: "block", color: "var(--muted)", marginTop: 2 }}>
                              {c.email}
                            </small>
                          )}
                        </td>
                        <td>{c.phone || "—"}</td>
                        <td>
                          <div className="role-tags">
                            {(Array.isArray(c.roles)
                              ? c.roles
                              : typeof c.roles === "string"
                                ? [c.roles]
                                : []
                            ).map((r) => (
                              <span key={r}>{getRoleLabel(r, t)}</span>
                            ))}
                          </div>
                        </td>
                        <td>#{c.id}</td>
                        <td>
                          <div className="row-actions">
                            {c.isActive !== false ? (
                              <>
                                <button
                                  className="action-btn"
                                  onClick={() => setEditingContact(c)}
                                  title={t("contacts.edit")}
                                >
                                  <Edit2 size={13} />
                                  <span>{t("contacts.edit")}</span>
                                </button>
                                <button
                                  className="action-btn danger"
                                  onClick={() => setArchivingContact(c)}
                                  title={t("contacts.archive")}
                                >
                                  <Archive size={13} />
                                  <span>{t("contacts.archive")}</span>
                                </button>
                              </>
                            ) : (
                              <button
                                className="action-btn"
                                onClick={() => setRestoringContact(c)}
                                title={t("contacts.restore")}
                              >
                                <RotateCcw size={13} />
                                <span>{t("contacts.restore")}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!displayedContacts.length && (
                  <div className="empty">
                    {contactTab === "active" ? t("contacts.noContactsFound") : t("contacts.noArchivedContacts")}
                  </div>
                )}
              </div>
            </section>
          )}

          {tab === "Finance" && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>{t("finance.title")}</h2>
                  <p>{t("finance.subtitle")}</p>
                </div>
                <button className="primary" onClick={() => setShowTx(true)}>
                  <Plus size={16} /> {t("finance.newRecord")}
                </button>
              </div>
              <Transactions rows={txs} locale={locale} t={t} />
            </section>
          )}

          {tab === "Invoices" && <InvoicesModule contacts={contacts} onNotice={notifyAndRefresh} />}
          {tab === "Calculator" && <CalculatorModule />}
          {tab === "Calendar" && <CalendarModule />}
          {tab === "Exchange Rate" && (
            <ExchangeRateModule
              canOverride={permissions.includes("currency.override")}
              onNotice={notify}
            />
          )}
          {tab === "Coffee Trade" && <CoffeeTradeModule contacts={contacts} onNotice={notify} />}
          {tab === "Processing" && <ProcessingModule onNotice={notify} />}
          {tab === "Inventory" && <InventoryModule onNotice={notify} />}
          {tab === "Vehicles" && <VehiclesModule contacts={contacts} onNotice={notify} />}
          {tab === "Employees" && <EmployeesModule contacts={contacts} onNotice={notify} />}
          {tab === "Reports" && <ReportsModule />}
          {tab === "Settings" && (
            <SettingsModule
              user={user}
              onNotice={notify}
              onCompanyChange={(company) => setCompanyName(company.name)}
              onRequestLogout={(mode) => setLogoutConfirmMode(mode)}
            />
          )}
        </div>
      </main>

      {(showContact || editingContact) && (
        <ContactModal
          initialContact={editingContact}
          close={() => {
            setShowContact(false);
            setEditingContact(null);
          }}
          saved={(isEdit) => {
            setShowContact(false);
            setEditingContact(null);
            load();
            notify(isEdit ? t("contacts.updatedToast") : t("contacts.savedToast"));
          }}
          t={t}
        />
      )}

      {archivingContact && (
        <ArchiveConfirmModal
          contact={archivingContact}
          close={() => setArchivingContact(null)}
          confirmed={() => {
            setArchivingContact(null);
            load();
            notify(t("contacts.archivedToast"));
          }}
          t={t}
        />
      )}

      {restoringContact && (
        <RestoreConfirmModal
          contact={restoringContact}
          close={() => setRestoringContact(null)}
          confirmed={() => {
            setRestoringContact(null);
            load();
            notify(t("contacts.restoredToast"));
          }}
          t={t}
        />
      )}

      {showTx && (
        <TransactionModal
          close={() => setShowTx(false)}
          saved={() => {
            setShowTx(false);
            load();
            notify(t("finance.savedToast"));
          }}
          t={t}
        />
      )}

      {showProfile && (
        <Modal
          title={t("profile.title")}
          close={() => setShowProfile(false)}
          closeAriaLabel={t("common.close")}
        >
          <div className="profile-header">
            <div className="profile-avatar-lg">
              {user?.fullName?.slice(0, 1) || <User size={22} />}
            </div>
            <div>
              <strong>{user?.fullName || "—"}</strong>
              <small>{companyName || t("common.workspace")}</small>
            </div>
          </div>

          <div className="profile-info-card">
            <div className="profile-info-row">
              <span>{t("profile.name")}</span>
              <strong>{user?.fullName || "—"}</strong>
            </div>
            <div className="profile-info-row">
              <span>{t("profile.email")}</span>
              <strong>{user?.email || "—"}</strong>
            </div>
            <div className="profile-info-row">
              <span>{t("profile.role")}</span>
              <strong style={{ textTransform: "capitalize" }}>{user?.role || "—"}</strong>
            </div>
            <div className="profile-info-row">
              <span>{t("profile.workspace")}</span>
              <strong>
                {companyName || "—"} {user?.companyId ? `(#${user.companyId})` : ""}
              </strong>
            </div>
          </div>

          <div className="profile-menu">
            <button
              type="button"
              className="profile-menu-btn"
              onClick={() => {
                setShowProfile(false);
                setTab("Settings");
              }}
            >
              <Settings size={17} />
              <span>{t("profile.accountSettings")}</span>
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="profile-menu-btn"
              disabled={logoutBusy}
              onClick={signOutOtherDevicesFromProfile}
            >
              <LogOut size={17} />
              <span>{t("settings.signOutOtherDevices")}</span>
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="profile-menu-btn danger"
              onClick={() => {
                setShowProfile(false);
                setLogoutConfirmMode("current");
              }}
            >
              <LogOut size={17} />
              <span>{t("profile.logout")}</span>
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="profile-menu-btn danger-account"
              onClick={() => {
                setShowProfile(false);
                setShowDeleteAccount(true);
              }}
            >
              <Trash2 size={17} />
              <span>{t("profile.deleteAccount")}</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </Modal>
      )}

      {showDeleteAccount && (
        <DeleteAccountModal
          user={user}
          close={() => setShowDeleteAccount(false)}
        />
      )}

      {logoutConfirmMode && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !logoutBusy) setLogoutConfirmMode(null);
          }}
        >
          <div className="modal logout-confirm-box" role="dialog" aria-modal="true">
            <h2>
              {logoutConfirmMode === "all"
                ? t("profile.logoutAllConfirmTitle")
                : t("profile.logoutConfirmTitle")}
            </h2>
            {logoutConfirmMode === "all" && (
              <p className="muted">{t("profile.logoutAllConfirmDesc")}</p>
            )}
            <div className="logout-confirm-actions">
              <button
                type="button"
                className="secondary"
                disabled={logoutBusy}
                onClick={() => performLogout(logoutConfirmMode)}
              >
                {logoutBusy ? t("common.loading") : t("profile.logMeOut")}
              </button>
              <button
                type="button"
                className="primary"
                disabled={logoutBusy}
                onClick={() => setLogoutConfirmMode(null)}
              >
                {t("profile.stayLoggedIn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <div className="stat-icon">
          <Icon size={18} />
        </div>
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function Transactions({
  rows,
  locale,
  t,
}: {
  rows: Tx[];
  locale: string;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t("finance.description")}</th>
            <th>{t("finance.type")}</th>
            <th>{t("finance.date")}</th>
            <th className="right">{t("finance.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{r.title}</b>
              </td>
              <td>
                <span className="kind">{getKindLabel(r.kind, t)}</span>
              </td>
              <td>{new Date(r.transactionDate).toLocaleDateString(locale)}</td>
              <td className="right amount">
                {Number(r.amount).toLocaleString(locale)} {r.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty">{t("finance.noRecords")}</div>}
    </div>
  );
}

const AVAILABLE_ROLES = [
  "customer",
  "supplier",
  "exporter",
  "employee",
  "driver",
  "other",
] as const;

function ContactModal({
  initialContact,
  close,
  saved,
  t,
}: {
  initialContact?: Contact | null;
  close: () => void;
  saved: (isEdit: boolean) => void;
  t: (key: TranslationKey) => string;
}) {
  const isEdit = !!initialContact;
  const [name, setName] = useState(initialContact?.name || "");
  const [phone, setPhone] = useState(initialContact?.phone || "");
  const [email, setEmail] = useState(initialContact?.email || "");
  const [address, setAddress] = useState(initialContact?.address || "");
  const [notes, setNotes] = useState(initialContact?.notes || "");
  const [roles, setRoles] = useState<string[]>(
    Array.isArray(initialContact?.roles) && initialContact.roles.length
      ? initialContact.roles
      : typeof initialContact?.roles === "string"
        ? [initialContact.roles]
        : ["customer"]
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const url = isEdit ? `/contacts/${initialContact!.id}` : "/contacts";
      const method = isEdit ? "PATCH" : "POST";

      const response = await api(url, {
        method,
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
          roles,
        }),
      });

      if (!response.ok) {
        setError(await apiError(response, t("contacts.saveError")));
        setBusy(false);
        return;
      }

      saved(isEdit);
    } catch {
      setError(t("contacts.saveError"));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isEdit ? t("contacts.editModalTitle") : t("contacts.modalTitle")}
      close={close}
      closeAriaLabel={t("common.close")}
    >
      <form onSubmit={submit}>
        <label>
          {t("contacts.fullName")}
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("contacts.namePlaceholder")}
          />
        </label>

        <label>
          {t("contacts.phoneLabel")}
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("contacts.phonePlaceholder")}
          />
        </label>

        <label>
          {t("contacts.emailLabel")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("contacts.emailPlaceholder")}
          />
        </label>

        <label>
          {t("contacts.addressLabel")}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("contacts.addressPlaceholder")}
          />
        </label>

        <label>
          {t("contacts.notesLabel")}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("contacts.notesPlaceholder")}
            rows={2}
          />
        </label>

        <label>
          {t("contacts.rolesLabel")} <small>{t("contacts.rolesHint")}</small>
        </label>

        <div className="checks">
          {AVAILABLE_ROLES.map((x) => (
            <label key={x} className="check">
              <input
                type="checkbox"
                checked={roles.includes(x)}
                onChange={(e) =>
                  setRoles(
                    e.target.checked
                      ? [...roles, x]
                      : roles.filter((v) => v !== x)
                  )
                }
              />
              {t(`roles.${x}` as TranslationKey)}
            </label>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="primary" disabled={busy || !roles.length || name.trim().length < 2}>
            {busy
              ? t("common.loading")
              : isEdit
                ? t("contacts.saveChanges")
                : t("contacts.saveContact")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ArchiveConfirmModal({
  contact,
  close,
  confirmed,
  t,
}: {
  contact: Contact;
  close: () => void;
  confirmed: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleArchive(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await api(`/contacts/${contact.id}/archive`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });

      if (!response.ok) {
        setError(await apiError(response, "Failed to archive contact"));
        setBusy(false);
        return;
      }

      confirmed();
    } catch {
      setError("Failed to archive contact");
      setBusy(false);
    }
  }

  return (
    <Modal title={t("contacts.archiveConfirmTitle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={handleArchive}>
        <p className="confirm-msg">
          {t("contacts.archiveConfirmMessage", { name: contact.name })}
        </p>

        <label>
          {t("contacts.reasonLabel")}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("contacts.reasonPlaceholder")}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="danger-btn" disabled={busy}>
            {busy ? t("common.loading") : t("contacts.archiveButton")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RestoreConfirmModal({
  contact,
  close,
  confirmed,
  t,
}: {
  contact: Contact;
  close: () => void;
  confirmed: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRestore(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await api(`/contacts/${contact.id}/restore`, {
        method: "POST",
      });

      if (!response.ok) {
        setError(await apiError(response, "Failed to restore contact"));
        setBusy(false);
        return;
      }

      confirmed();
    } catch {
      setError("Failed to restore contact");
      setBusy(false);
    }
  }

  return (
    <Modal title={t("contacts.restoreConfirmTitle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={handleRestore}>
        <p className="confirm-msg">
          {t("contacts.restoreConfirmMessage", { name: contact.name })}
        </p>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? t("common.loading") : t("contacts.restoreButton")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const TRANSACTION_KINDS = [
  { value: "income", key: "transactionKinds.income" },
  { value: "expense", key: "transactionKinds.expense" },
  { value: "receivable", key: "transactionKinds.receivable" },
  { value: "payable", key: "transactionKinds.payable" },
  { value: "loan_given", key: "transactionKinds.loan_given" },
  { value: "loan_received", key: "transactionKinds.loan_received" },
] as const;

function TransactionModal({
  close,
  saved,
  t,
}: {
  close: () => void;
  saved: () => void;
  t: (key: TranslationKey) => string;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("income");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ETB");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const response = await api("/transactions", {
      method: "POST",
      body: JSON.stringify({
        title,
        kind,
        amount,
        currency,
        transactionDate: date,
        notes,
      }),
    });
    if (!response.ok) {
      setError(await apiError(response, t("finance.saveError")));
      return;
    }
    saved();
  }

  return (
    <Modal title={t("finance.modalTitle")} close={close} closeAriaLabel={t("common.close")}>
      <form onSubmit={submit}>
        <label>
          {t("finance.descLabel")}
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("finance.descPlaceholder")}
          />
        </label>
        <label>
          {t("finance.typeLabel")}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {TRANSACTION_KINDS.map((k) => (
              <option value={k.value} key={k.value}>
                {t(k.key as TranslationKey)}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            {t("finance.amountLabel")}
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            {t("finance.currencyLabel")}
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="ETB">ETB</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
        <label>
          {t("finance.dateLabel")}
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t("finance.notesLabel")}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>
        {error && <p className="error">{error}</p>}
        <p className="form-note">{t("finance.firstVersionNote")}</p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            {t("common.cancel")}
          </button>
          <button className="primary">{t("finance.saveRecord")}</button>
        </div>
      </form>
    </Modal>
  );
}

function getRoleLabel(role: string, t: (key: TranslationKey) => string): string {
  const roleKey = `roles.${role}` as TranslationKey;
  const translated = t(roleKey);
  return translated !== roleKey ? translated : role;
}

function getKindLabel(kind: string, t: (key: TranslationKey) => string): string {
  const kindKey = `transactionKinds.${kind}` as TranslationKey;
  const translated = t(kindKey);
  return translated !== kindKey ? translated : kind.replaceAll("_", " ");
}
