// チーム未指定（team IS NULL）の定期費用を表す表示ラベル
export const ORG_WIDE_TEAM_LABEL = "全体共通";

// ログインを許可するメールアドレスのドメイン（@ を含まない）。
// クライアント（サインインボタン）・サーバ（OAuth コールバック / プロフィール作成）の
// 双方でこの単一定義を参照し、ドメイン制限を多層で担保する。
export const ALLOWED_EMAIL_DOMAIN = "future-tech-association.org";

// メールアドレスが許可ドメインかどうかを判定する。
// 大文字小文字・前後空白を無視し、ドメイン部の完全一致のみを許可する
// （endsWith による "evil-future-tech-association.org" のような部分一致を防ぐ）。
export const isAllowedEmailDomain = (
  email: string | null | undefined,
): boolean => {
  if (!email) {
    return false;
  }
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) {
    return false;
  }
  const domain = email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
  return domain === ALLOWED_EMAIL_DOMAIN;
};
