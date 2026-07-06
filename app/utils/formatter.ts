export const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: 0,
  }).format(amount);
};

export const formatTimeToJp = (date: string | null) => {
  if (date === null || date === undefined) return "-";
  return new Date(date).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
};

// ローカル時刻ベースで月キー（YYYY-MM）へ変換する（toISOString の UTC ズレを避ける）
export const toMonthString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

// "YYYY-MM-DD" 文字列 → Date（ローカル 0:00）。null はそのまま返す。
export const parseDateString = (value: string | null): Date | null =>
  value ? new Date(`${value}T00:00:00`) : null;

// Date → "YYYY-MM-DD"。ローカル要素で組み立て、toISOString の UTC ズレを避ける。
// null はそのまま返す。
export const toDateString = (date: Date | null): string | null => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// 月キー（YYYY-MM）を「YYYY年M月」表記にする
export const formatMonthLabel = (month: string) =>
  `${month.slice(0, 4)}年${parseInt(month.slice(5, 7), 10)}月`;

// 月キー（YYYY-MM）を「M月」表記にする
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
