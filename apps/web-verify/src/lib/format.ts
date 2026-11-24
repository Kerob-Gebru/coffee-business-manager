export function fmtMoney(
  value: string | number | null | undefined,
  currency: string,
  locale: string
): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (Number.isNaN(amount)) return "—";
  return `${amount.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function fmtDate(
  value: string | Date | null | undefined,
  locale: string
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale);
}

export function fmtNumber(
  value: string | number | null | undefined,
  locale: string,
  digits = 2
): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (Number.isNaN(amount)) return "—";
  return amount.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
