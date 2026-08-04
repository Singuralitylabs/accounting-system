// JWT（access_token）のペイロードから user_class クレームを読む。
// Custom Access Token Hook（migration 15/16）が付与する。
//
// 呼び出し側で access_token の署名検証（getUser() 等）が済んでいることを前提とする。
// このトークン自体の署名が有効であれば、ペイロード中の他のクレームを書き換えると
// 署名検証に失敗するため、user_class クレームも改ざんされていないとみなせる。
//
// null を返した場合は呼び出し側で profiles への DB フォールバックが必要。クレームが
// 明示的に null（プロフィール未作成 / class 未設定）の場合もフォールバック対象とする。
// OAuth コールバック（app/auth/callback/route.ts）はトークン発行（フック実行）の直後に
// profiles 行を作成するため、新規ユーザーの初回トークンは必ず user_class: null になり、
// ここで「クラス無しと確定」扱いにすると直後のロール付与が最大約1時間反映されなくなる。
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
