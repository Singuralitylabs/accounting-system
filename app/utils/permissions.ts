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

// ロール制限は無いが、未ログインではアクセスできないルート。
// `/` は完全一致のみ（`matchesRoute("/", pathname)` だと全パスにマッチするため）。
export const AUTH_ONLY_ROUTES = ["/", "/new", "/matters"] as const;

export const isAuthOnlyPath = (pathname: string) =>
  AUTH_ONLY_ROUTES.some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );

export type NavItem = {
  href: string;
  label: string;
  description: string;
};

// ヘッダー（PC / モバイル共通）とトップページハブのナビゲーション項目。
// ROUTE_PERMISSIONS に無いルートはログインユーザー全員に表示する。
// アイコンはここに置かない（middleware が本モジュールを import するため、
// Edge バンドルに React コンポーネントが漏れる）。href → アイコンの対応はハブ側。
const NAV_ITEMS: NavItem[] = [
  {
    href: "/matters",
    label: "案件カード",
    description: "自分の案件を一覧で確認・編集します",
  },
  {
    href: "/new",
    label: "新規作成",
    description: "新しい案件を登録します",
  },
  {
    href: "/team",
    label: "チーム案件一覧",
    description: "自チームの案件を一覧で確認します",
  },
  {
    href: "/accounting",
    label: "経理用一覧",
    description: "全案件の経理確認・完了処理を行います",
  },
  {
    href: "/profit-loss",
    label: "損益計算書",
    description: "月次の売上・費用・損益を確認します",
  },
  {
    href: "/recurring-costs",
    label: "定期費用マスタ",
    description: "毎月固定の管理費を登録・編集します",
  },
  {
    href: "/extra-entries",
    label: "経理追加収支",
    description: "案件に紐づかない収入・支出を登録します",
  },
  {
    href: "/dashboard",
    label: "管理画面",
    description: "ユーザー権限とマスタデータを管理します",
  },
];

// 指定ロールが閲覧できるナビゲーション項目を返す
export const visibleNavItems = (profileClass: string | null | undefined) =>
  NAV_ITEMS.filter((item) => {
    const allowedClasses = ROUTE_PERMISSIONS[item.href];
    return !allowedClasses || hasClassAccess(allowedClasses, profileClass);
  });
