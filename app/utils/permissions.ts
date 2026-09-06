// profiles.class が取りうるロール（DB 上は string | null のため、判定側で文字列を受ける）
export type Role = "public" | "teamleader" | "accounting" | "admin";

// ルートごとの閲覧許可ロール。
// middleware のルート保護・ヘッダーのナビゲーション表示・Server Action の権限確認で
// 共用する単一の定義（ロール変更時はここだけ直せばよい）。
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  // 案件カード（/matters）配下のタブ。/matters 自体は AUTH_ONLY_ROUTES で
  // ログインのみ必須（ロール制限なし）のため、サブルートのみここに追加する。
  // どちらも "/matters" 配下の他方の前方一致にはならないため評価順は問わない。
  "/matters/team": ["teamleader", "admin"],
  "/matters/accounting": ["accounting", "admin"],
  // 旧 URL。ページ側で新 URL へリダイレクトするが、リダイレクト前のロール保護は
  // 従来どおりここで行う（未許可ロールは旧 URL の時点で "/" に弾く）。
  "/team": ["teamleader", "admin"],
  "/accounting": ["accounting", "admin"],
  "/profit-loss": ["teamleader", "accounting", "admin"],
  "/recurring-costs": ["accounting", "admin"],
  "/extra-entries": ["accounting", "admin"],
  "/budget-declarations": ["teamleader", "accounting", "admin"],
  "/dashboard": ["admin"],
};

// 損益計算書を閲覧できるロール（/profit-loss のルート保護と常に一致する）
export const PL_ALLOWED_CLASSES = ROUTE_PERMISSIONS["/profit-loss"];

// 損益調整（実績額修正）を書き込めるロール。/profit-loss 内の操作で専用ルートを
// 持たないため ROUTE_PERMISSIONS ではなくここに直接定義する。
// profit_loss_adjustments の RLS（INSERT/UPDATE/DELETE は accounting / admin のみ）と揃える
export const PL_ADJUSTMENT_WRITE_CLASSES: Role[] = ["accounting", "admin"];

export const hasClassAccess = (
  allowedClasses: readonly Role[],
  profileClass: string | null | undefined,
) =>
  !!profileClass &&
  (allowedClasses as readonly string[]).includes(profileClass);

export const matchesRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

// ロール制限は無いが、未ログインではアクセスできないルート。
// matchesRoute の引数は (pathname, route)。`matchesRoute("/matters", "/")` は
// `"/matters" === "/"` でも `"/matters".startsWith("//")` でもないので false。
// そのため AUTH_ONLY_ROUTES の "/" はトップページだけにマッチする。
export const AUTH_ONLY_ROUTES = ["/", "/new", "/matters"] as const;

export const isAuthOnlyPath = (pathname: string) =>
  AUTH_ONLY_ROUTES.some((route) => matchesRoute(pathname, route));

export type NavItem = {
  href: string;
  label: string;
  description: string;
};

// ヘッダー（PC / モバイル共通）とトップページハブのナビゲーション項目。
// ROUTE_PERMISSIONS に無いルートはログインユーザー全員に表示する。
// アイコンはここに置かない（middleware が本モジュールを import するため、
// Edge バンドルに React コンポーネントが漏れる）。href → アイコンの対応はハブ側。
//
// 案件カード（新規作成・チーム案件・経理用一覧）と損益計算書（定期費用マスタ・
// 経理追加収支）はそれぞれのページ内タブ・ボタンに集約したため、ここには
// カテゴリの入口となる4項目のみを置く（案件カード / 損益計算書 / 事前収支申告 / 管理画面）。
const NAV_ITEMS: NavItem[] = [
  {
    href: "/matters",
    label: "案件カード",
    description:
      "自分の案件の確認・新規作成に加え、チーム案件・経理用一覧をタブで切り替えます",
  },
  {
    href: "/profit-loss",
    label: "損益計算書",
    description:
      "月次の売上・費用・損益を確認します（経理担当者・管理者は定期費用マスタ・経理追加収支への導線あり）",
  },
  {
    href: "/budget-declarations",
    label: "事前収支申告",
    description: "翌月のチーム収支の見込みを申告・確認します",
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
