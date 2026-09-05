export const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: 0,
  }).format(amount);
};

// timeZone を明示するのは、実行環境の TZ に依存させないため。
// SSR（UTC のサーバ）とブラウザ（JST）で結果が 9 時間ズレると、
// クライアントコンポーネントのハイドレーション不一致になる。
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

// 月キー（YYYY-MM）に月数を加算する。Date を経由しないため DST・UTC ズレの影響を受けない。
export const addMonths = (month: string, count: number): string => {
  const year = parseInt(month.slice(0, 4), 10);
  const monthNumber = parseInt(month.slice(5, 7), 10);
  // 0 始まりに直してから加算し、年繰り上がり・繰り下がりを剰余で処理する
  const zeroBased = year * 12 + (monthNumber - 1) + count;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonthNumber = zeroBased - nextYear * 12 + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonthNumber).padStart(2, "0")}`;
};

// 月キー（YYYY-MM）または日付文字列（YYYY-MM-DD）→ 月初日（YYYY-MM-01）。
// 月単位で保持するカラム（recurring_costs.start_month /
// budget_declarations.target_month）への書き込み・絞り込みで使う。
export const toFirstOfMonth = (value: string): string =>
  `${value.slice(0, 7)}-01`;

// JST 基準の当月キー（YYYY-MM）。サーバ（UTC）とブラウザ（JST）で結果を揃えるため、
// ローカルタイムゾーンに依存せず UTC からの +9 時間で判定する。
export const currentJstMonth = (now: Date = new Date()): string =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);

// JST 基準の「今日」の日（1-31）。Vercel Cron の実行環境は UTC のため、
// currentJstMonth と同じ +9 時間シフトで判定する（事前収支申告の未申告リマインド対象日判定用）。
export const currentJstDate = (now: Date = new Date()): number =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDate();

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
