import Link from "next/link";
import PageTitle from "../components/PageTitle";
import { ALLOWED_EMAIL_DOMAIN } from "../utils/constants";

const AuthError = ({
  searchParams,
}: {
  searchParams: { reason?: string };
}) => {
  const isDomainError = searchParams.reason === "domain";

  const message = isDomainError
    ? `${ALLOWED_EMAIL_DOMAIN} のメールアドレスのみログインできます。`
    : "ログイン処理でエラーが発生しました。お手数ですが、もう一度お試しください。";

  return (
    <main>
      <PageTitle title="ログインエラー" />
      <div className="flex flex-col justify-center items-center gap-6 mt-8">
        <p className="text-center text-gray-700">{message}</p>
        <Link
          href="/login"
          className="flex justify-center h-12 items-center bg-blue-600 text-lg rounded text-white w-40 text-center hover:cursor-pointer hover:bg-blue-300"
        >
          ログインへ戻る
        </Link>
      </div>
    </main>
  );
};

export default AuthError;
