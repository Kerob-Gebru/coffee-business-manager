"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Calendar as CalendarIcon, Check, Copy } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import {
  ETHIOPIAN_MONTHS,
  GREGORIAN_MONTHS,
  WEEKDAYS,
  daysInEthiopianMonth,
  ethiopianToGregorian,
  ethiopianToJdn,
  formatIsoDate,
  getEthiopianYearMonths,
  gregorianToEthiopian,
  gregorianToJdn,
  isEthiopianLeapYear,
  parseIsoDate,
  weekdayIndexFromJdn,
  type SimpleDate,
} from "@/lib/ethiopian-calendar";

type Direction = "g2e" | "e2g";

function todayGregorian(): SimpleDate {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

function getMonthName(
  list: readonly { number: number; en: string; am: string; om: string }[],
  month: number,
  lang: "en" | "am" | "om",
): string {
  const found = list.find((m) => m.number === month);
  if (!found) return String(month);
  return found[lang];
}

function formatShortGregorian(date: SimpleDate): string {
  const m = getMonthName(GREGORIAN_MONTHS, date.month, "en").slice(0, 3);
  return `${m} ${date.day}, ${date.year}`;
}

export default function CalendarModule() {
  const { t, language } = useTranslation();

  const initialGreg = useMemo(() => todayGregorian(), []);
  const initialEth = useMemo(
    () => gregorianToEthiopian(initialGreg) ?? { year: 2019, month: 1, day: 1 },
    [initialGreg],
  );

  const [direction, setDirection] = useState<Direction>("g2e");
  const [gregInput, setGregInput] = useState<string>(() => formatIsoDate(initialGreg));
  const [ethYear, setEthYear] = useState<string>(String(initialEth.year));
  const [ethMonth, setEthMonth] = useState<number>(initialEth.month);
  const [ethDay, setEthDay] = useState<string>(String(initialEth.day));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const parsedGreg = useMemo(() => parseIsoDate(gregInput), [gregInput]);
  const convertedEth = useMemo(
    () => (parsedGreg ? gregorianToEthiopian(parsedGreg) : null),
    [parsedGreg],
  );

  const parsedEthInput = useMemo<SimpleDate | null>(() => {
    const y = Number(ethYear);
    const d = Number(ethDay);
    if (!Number.isInteger(y) || !Number.isInteger(d)) return null;
    return { year: y, month: ethMonth, day: d };
  }, [ethYear, ethMonth, ethDay]);

  const convertedGreg = useMemo(
    () => (parsedEthInput ? ethiopianToGregorian(parsedEthInput) : null),
    [parsedEthInput],
  );

  const maxDaysForSelectedEthMonth = useMemo(() => {
    const y = Number(ethYear);
    if (!Number.isInteger(y) || y < 1) return ethMonth === 13 ? 5 : 30;
    return daysInEthiopianMonth(y, ethMonth);
  }, [ethYear, ethMonth]);

  const activeEthYearForTable = useMemo(() => {
    if (direction === "g2e") return convertedEth?.year ?? initialEth.year;
    const y = Number(ethYear);
    return Number.isInteger(y) && y >= 1 && y <= 9999 ? y : initialEth.year;
  }, [direction, convertedEth, ethYear, initialEth.year]);

  const activeEthMonthForHighlight =
    direction === "g2e" ? (convertedEth?.month ?? null) : ethMonth;

  const yearMonths = useMemo(
    () => getEthiopianYearMonths(activeEthYearForTable),
    [activeEthYearForTable],
  );

  const todayJdn = gregorianToJdn(initialGreg.year, initialGreg.month, initialGreg.day);
  const todayWeekday = WEEKDAYS[weekdayIndexFromJdn(todayJdn)];

  function setToday() {
    const g = todayGregorian();
    const e = gregorianToEthiopian(g);
    setGregInput(formatIsoDate(g));
    if (e) {
      setEthYear(String(e.year));
      setEthMonth(e.month);
      setEthDay(String(e.day));
    }
  }

  function swapDirection() {
    if (direction === "g2e") {
      if (convertedEth) {
        setEthYear(String(convertedEth.year));
        setEthMonth(convertedEth.month);
        setEthDay(String(convertedEth.day));
      }
      setDirection("e2g");
    } else {
      if (convertedGreg) {
        setGregInput(formatIsoDate(convertedGreg));
      }
      setDirection("g2e");
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard may be restricted in embedded previews.
    }
  }

  const g2eWeekday =
    parsedGreg && convertedEth
      ? WEEKDAYS[weekdayIndexFromJdn(gregorianToJdn(parsedGreg.year, parsedGreg.month, parsedGreg.day))]
      : null;

  const e2gWeekday =
    parsedEthInput && convertedGreg
      ? WEEKDAYS[weekdayIndexFromJdn(ethiopianToJdn(parsedEthInput.year, parsedEthInput.month, parsedEthInput.day))]
      : null;

  const g2eDisplay = convertedEth
    ? `${getMonthName(ETHIOPIAN_MONTHS, convertedEth.month, language)} ${convertedEth.day}, ${convertedEth.year} ${t("calendar.ecSuffix")}`
    : "";

  const e2gDisplay = convertedGreg
    ? `${getMonthName(GREGORIAN_MONTHS, convertedGreg.month, language)} ${convertedGreg.day}, ${convertedGreg.year}`
    : "";

  return (
    <div className="calendar-stack">
      <section className="panel">
        <div className="panel-head vehicle-panel-head">
          <div>
            <h2>{t("calendar.todayReference")}</h2>
            <p>{t("calendar.subtitle")}</p>
          </div>
          <button type="button" className="secondary" onClick={setToday}>
            <CalendarIcon size={15} /> {t("calendar.useToday")}
          </button>
        </div>

        <div className="calendar-today-grid">
          <div className="calendar-ref-card">
            <small>{t("calendar.gregorianDate")}</small>
            <strong>
              {todayWeekday[language === "am" ? "am" : language === "om" ? "om" : "en"]},{" "}
              {getMonthName(GREGORIAN_MONTHS, initialGreg.month, language)} {initialGreg.day},{" "}
              {initialGreg.year}
            </strong>
            <span>{formatIsoDate(initialGreg)}</span>
          </div>
          <div className="calendar-ref-card">
            <small>{t("calendar.ethiopianDate")}</small>
            <strong>
              {todayWeekday[language === "am" ? "am" : language === "om" ? "om" : "ethiopicEn"]},{" "}
              {getMonthName(ETHIOPIAN_MONTHS, initialEth.month, language)} {initialEth.day},{" "}
              {initialEth.year} {t("calendar.ecSuffix")}
            </strong>
            <span>
              {formatIsoDate(initialEth)} · {ETHIOPIAN_MONTHS[initialEth.month - 1]?.am}{" "}
              {initialEth.day} ቀን {initialEth.year} ዓ.ም
            </span>
          </div>
        </div>
      </section>

      <div className="calendar-layout">
        <section className="panel">
          <div className="calendar-mode-bar">
            <div className="filter-tabs" role="tablist" aria-label={t("calendar.title")}>
              <button
                type="button"
                role="tab"
                aria-selected={direction === "g2e"}
                className={`filter-tab ${direction === "g2e" ? "active" : ""}`}
                onClick={() => setDirection("g2e")}
              >
                {t("calendar.gregorianToEthiopian")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={direction === "e2g"}
                className={`filter-tab ${direction === "e2g" ? "active" : ""}`}
                onClick={() => setDirection("e2g")}
              >
                {t("calendar.ethiopianToGregorian")}
              </button>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={swapDirection}
              aria-label={t("calendar.swap")}
            >
              <ArrowLeftRight size={15} /> {t("calendar.swap")}
            </button>
          </div>

          {direction === "g2e" ? (
            <div className="calendar-form">
              <label>
                {t("calendar.gregorianDate")}
                <input
                  type="date"
                  value={gregInput}
                  onChange={(e) => setGregInput(e.target.value)}
                />
              </label>

              {convertedEth && g2eWeekday ? (
                <div className="calendar-result-card">
                  <div className="calendar-result-head">
                    <div>
                      <small>{t("calendar.result")}</small>
                      <h3>{g2eDisplay}</h3>
                      <p className="calendar-subline">
                        {g2eWeekday.am} · {ETHIOPIAN_MONTHS[convertedEth.month - 1]?.am}{" "}
                        {convertedEth.day} ቀን {convertedEth.year} ዓ.ም
                      </p>
                    </div>
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => copyText(`${g2eDisplay} (${formatIsoDate(convertedEth)})`)}
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? t("calendar.copied") : t("calendar.copy")}
                    </button>
                  </div>

                  <div className="calendar-meta-grid">
                    <div>
                      <small>{t("calendar.weekday")}</small>
                      <strong>
                        {g2eWeekday.en} ({g2eWeekday.ethiopicEn})
                      </strong>
                    </div>
                    <div>
                      <small>{t("calendar.isoFormat")}</small>
                      <strong>{formatIsoDate(convertedEth)}</strong>
                    </div>
                    <div>
                      <small>{t("calendar.ethiopianDate")}</small>
                      <strong>
                        {isEthiopianLeapYear(convertedEth.year)
                          ? t("calendar.leapYear")
                          : t("calendar.regularYear")}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="error">{t("calendar.invalidDate")}</p>
              )}
            </div>
          ) : (
            <div className="calendar-form">
              <div className="calendar-eth-inputs">
                <label>
                  {t("calendar.year")} ({t("calendar.ecSuffix")})
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={ethYear}
                    onChange={(e) => setEthYear(e.target.value)}
                  />
                </label>

                <label>
                  {t("calendar.month")}
                  <select
                    value={ethMonth}
                    onChange={(e) => setEthMonth(Number(e.target.value))}
                  >
                    {ETHIOPIAN_MONTHS.map((m) => (
                      <option key={m.number} value={m.number}>
                        {m.number}. {m[language]} ({m.am})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {t("calendar.day")} (1–{maxDaysForSelectedEthMonth})
                  <input
                    type="number"
                    min={1}
                    max={maxDaysForSelectedEthMonth}
                    value={ethDay}
                    onChange={(e) => setEthDay(e.target.value)}
                  />
                </label>
              </div>

              {convertedGreg && e2gWeekday ? (
                <div className="calendar-result-card">
                  <div className="calendar-result-head">
                    <div>
                      <small>{t("calendar.result")}</small>
                      <h3>
                        {e2gWeekday[language === "am" ? "am" : language === "om" ? "om" : "en"]},{" "}
                        {e2gDisplay}
                      </h3>
                      <p className="calendar-subline">
                        {e2gWeekday.en}, {getMonthName(GREGORIAN_MONTHS, convertedGreg.month, "en")}{" "}
                        {convertedGreg.day}, {convertedGreg.year}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => copyText(`${e2gDisplay} (${formatIsoDate(convertedGreg)})`)}
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? t("calendar.copied") : t("calendar.copy")}
                    </button>
                  </div>

                  <div className="calendar-meta-grid">
                    <div>
                      <small>{t("calendar.weekday")}</small>
                      <strong>
                        {e2gWeekday.en} ({e2gWeekday.ethiopicEn})
                      </strong>
                    </div>
                    <div>
                      <small>{t("calendar.isoFormat")}</small>
                      <strong>{formatIsoDate(convertedGreg)}</strong>
                    </div>
                    <div>
                      <small>{t("calendar.ethiopianDate")}</small>
                      <strong>
                        {isEthiopianLeapYear(Number(ethYear))
                          ? t("calendar.leapYear")
                          : t("calendar.regularYear")}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="error">{t("calendar.invalidDate")}</p>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>
                {t("calendar.monthsTableTitle")} · {activeEthYearForTable} {t("calendar.ecSuffix")}
              </h2>
              <p>{t("calendar.monthsTableDesc")}</p>
            </div>
            <span className="status-pill">
              {isEthiopianLeapYear(activeEthYearForTable)
                ? t("calendar.leapYear")
                : t("calendar.regularYear")}
            </span>
          </div>

          <div className="table-wrap calendar-months-table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("calendar.month")}</th>
                  <th className="right">{t("calendar.daysCount")}</th>
                  <th>{t("calendar.gregorianRange")}</th>
                </tr>
              </thead>
              <tbody>
                {yearMonths.map((item) => {
                  const meta = ETHIOPIAN_MONTHS[item.month - 1];
                  return (
                    <tr
                      key={item.month}
                      className={activeEthMonthForHighlight === item.month ? "row-selected" : undefined}
                    >
                      <td>{item.month}</td>
                      <td>
                        <b>{meta?.[language]}</b>
                        <small style={{ display: "block", color: "var(--muted)" }}>
                          {language === "am" ? meta?.en : meta?.am}
                        </small>
                      </td>
                      <td className="right">{item.days}</td>
                      <td>
                        {formatShortGregorian(item.startGregorian)} –{" "}
                        {formatShortGregorian(item.endGregorian)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
