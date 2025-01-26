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
