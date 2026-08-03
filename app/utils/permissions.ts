// profiles.class が取りうるロール（DB 上は string | null のため、判定側で文字列を受ける）
export type Role = "public" | "teamleader" | "accounting" | "admin";

// ルートごとの閲覧許可ロール。
// middleware のルート保護・ヘッダーのナビゲーション表示・Server Action の権限確認で
// 共用する単一の定義（ロール変更時はここだけ直せばよい）。
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  "/team": ["teamleader", "admin"],
  "/accounting": ["accounting", "admin"],
  "/profit-loss": ["teamleader", "accounting", "admin"],
  "/recurring-costs": ["accounting", "admin"],
  "/extra-entries": ["accounting", "admin"],
  "/dashboard": ["admin"],
};

// 損益計算書を閲覧できるロール（/profit-loss のルート保護と常に一致する）
export const PL_ALLOWED_CLASSES = ROUTE_PERMISSIONS["/profit-loss"];

export const hasClassAccess = (
  allowedClasses: readonly Role[],
  profileClass: string | null | undefined,
) =>
  !!profileClass &&
  (allowedClasses as readonly string[]).includes(profileClass);

// ヘッダー（PC / モバイル共通）のナビゲーション項目。
// ROUTE_PERMISSIONS に無いルートはログインユーザー全員に表示する。
export const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "案件カード" },
  { href: "/new", label: "新規作成" },
  { href: "/team", label: "チーム案件一覧" },
  { href: "/accounting", label: "経理用一覧" },
  { href: "/profit-loss", label: "損益計算書" },
  { href: "/recurring-costs", label: "定期費用マスタ" },
  { href: "/extra-entries", label: "経理追加収支" },
  { href: "/dashboard", label: "管理画面" },
];

// 指定ロールが閲覧できるナビゲーション項目を返す
export const visibleNavItems = (profileClass: string | null | undefined) =>
  NAV_ITEMS.filter((item) => {
    const allowedClasses = ROUTE_PERMISSIONS[item.href];
    return !allowedClasses || hasClassAccess(allowedClasses, profileClass);
  });
