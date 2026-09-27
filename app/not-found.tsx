import Link from "next/link";
import PageTitle from "./components/PageTitle";

export default function NotFound() {
  return (
    <main>
      <PageTitle
        title="ページが見つかりません"
        className="mx-auto max-w-5xl px-4 pt-6"
      />
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 mt-8">
        <p className="text-left text-gray-700">
          指定されたページは存在しません。
        </p>
        <Link
          href="/"
          className="flex justify-center h-12 items-center bg-blue-600 text-lg rounded text-white w-40 text-center hover:cursor-pointer hover:bg-blue-300"
        >
          トップへ戻る
        </Link>
      </div>
    </main>
  );
}
