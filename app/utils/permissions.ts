// profiles.class が取りうるロール（DB 上は string | null のため、判定側で文字列を受ける）
export type Role = "public" | "teamleader" | "accounting" | "admin";

// JWT（access_token）のペイロードから user_class クレームを読む。
// Custom Access Token Hook（migration 15/16）が付与する。
//
// 呼び出し側で access_token の署名検証（getUser() 等）が済んでいることを前提とする。
// このトークン自体の署名が有効であれば、ペイロード中の他のクレームを書き換えると
// 署名検証に失敗するため、user_class クレームも改ざんされていないとみなせる。
//
// 戻り値が null の場合（クレームキー自体が無い / 値が null / 空文字 / 文字列以外 /
// デコード失敗）は、呼び出し側で profiles への DB フォールバックが必要。
//
// クレームが明示的に null（プロフィール未作成 / class 未設定）の場合も
// フォールバック対象とする。OAuth コールバック（app/auth/callback/route.ts）では
// トークン発行（フック実行）の直後に profiles 行を作成するため、新規ユーザーの
// 初回トークンは必ず user_class: null になる。この時点で null を「クラス無しと
// 確定」として扱うと、直後の管理者によるロール付与が最大約1時間反映されなくなる
// （DB フォールバックであれば直近の profiles.class を即座に反映できる）。
export const readClassClaim = (
  accessToken: string | undefined,
): string | null => {
  if (!accessToken) return null;
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return null;
    // JWT は base64url。atob は forgiving decode のためパディング補完は不要。
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as { user_class?: unknown };
    const claim = payload.user_class;
    return typeof claim === "string" && claim.length > 0 ? claim : null;
  } catch {
    return null;
  }
};

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
