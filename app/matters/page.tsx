import Link from "next/link";
import { Suspense } from "react";
import PageTitle from "../components/PageTitle";
import DynamicMatterList from "../components/dynamic/DynamicMatterList";
import { LoadingSpinner } from "../components/LoadingSpinner";

const UserMatterPage = () => {
  return (
    <main>
      <PageTitle title="案件カード" />
      <div className="mx-auto flex max-w-5xl justify-end px-4 pb-4">
        <Link
          href="/new"
          className="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          + 新規作成
        </Link>
      </div>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicMatterList />
      </Suspense>
    </main>
  );
};

export default UserMatterPage;
