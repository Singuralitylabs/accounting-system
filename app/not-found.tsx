import Link from "next/link";
import PageTitle from "./components/PageTitle";

export default function NotFound() {
  return (
    <main>
      <PageTitle title="ページが見つかりません" />
      <div className="flex flex-col justify-center items-center gap-6 mt-8">
        <p className="text-center text-gray-700">
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
