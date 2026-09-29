export const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: 0,
  }).format(amount);
};

// Explicit timeZone so SSR (UTC server) and browser (JST) agree; a 9h mismatch would cause
// hydration errors.
export const formatTimeToJp = (date: string | null) => {
  if (date === null || date === undefined) return "-";
  return new Date(date).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
};

// Local-time based (avoids the UTC shift of toISOString).
export const toMonthString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const parseDateString = (value: string | null): Date | null =>
  value ? new Date(`${value}T00:00:00`) : null;

// Built from local parts to avoid the UTC shift of toISOString.
export const toDateString = (date: Date | null): string | null => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Avoids Date, so DST / UTC shifts do not apply.
export const addMonths = (month: string, count: number): string => {
  const year = parseInt(month.slice(0, 4), 10);
  const monthNumber = parseInt(month.slice(5, 7), 10);
  // Zero-based so the modulo handles year carry/borrow.
  const zeroBased = year * 12 + (monthNumber - 1) + count;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonthNumber = zeroBased - nextYear * 12 + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonthNumber).padStart(2, "0")}`;
};

// Validates month keys at the entry point of fetch ranges reachable from clients via Server Actions.
// Lives here so the "use server" data layer need not depend on the whole P&L module.
export const isMonthKey = (value: string): boolean =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

// For month-granular columns (recurring_costs.start_month / budget_declarations.target_month).
export const toFirstOfMonth = (value: string): string =>
  `${value.slice(0, 7)}-01`;

// Null-preserving variant for optional end months (still running).
export const toFirstOfMonthOrNull = (value: string | null): string | null =>
  value ? toFirstOfMonth(value) : null;

// UTC + 9h instead of local TZ, so server (UTC) and browser (JST) agree.
export const currentJstMonth = (now: Date = new Date()): string =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);

// Same +9h shift as currentJstMonth (Vercel Cron runs in UTC).
export const currentJstDate = (now: Date = new Date()): number =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDate();

export const formatMonthLabel = (month: string) =>
  `${month.slice(0, 4)}年${parseInt(month.slice(5, 7), 10)}月`;

export const formatMonthHeader = (month: string) =>
  `${parseInt(month.slice(5, 7), 10)}月`;

export const formatDateToJp = (date: string | null) => {
  if (!date) return "-";
  try {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  } catch {
    return "-";
  }
};

// Explicit timeZone, for the same reason as formatTimeToJp.
export const formatDateTimeToJp = (value: string | null): string => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
};
