import Link from "next/link";
import { AuthPageShell } from "../components/auth/AuthPageShell";
import { authPrimaryButtonClassName } from "../components/auth/authButtonStyles";
import { ALLOWED_EMAIL_DOMAIN } from "../utils/constants";

const AuthError = ({ searchParams }: { searchParams: { reason?: string } }) => {
  const isDomainError = searchParams.reason === "domain";

  const message = isDomainError
    ? `${ALLOWED_EMAIL_DOMAIN} のメールアドレスのみログインできます。`
    : "ログイン処理でエラーが発生しました。お手数ですが、もう一度お試しください。";

  return (
    <AuthPageShell title="ログインエラー" description={message}>
      <Link href="/login" className={authPrimaryButtonClassName}>
        ログインへ戻る
      </Link>
    </AuthPageShell>
  );
};

export default AuthError;
