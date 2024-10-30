import Link from "next/link";
import React, { FC, Suspense } from "react";
import MobileHeader from "./mobile-header";
import UserButton from "./user-button";

const Header: FC = () => {
  return (
    <header className="bg-gray-800 p-4">
      <nav className="flex justify-between items-center">
        <div className="hidden sm:flex space-x-4">
          <Link
            href="/"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            案件一覧
          </Link>
          <Link
            href="/new"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            新規作成
          </Link>
          <Link
            href="/dashboard"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            管理画面
          </Link>
        </div>
        <div className="hidden sm:flex ml-auto rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500">
          <Suspense fallback={<div>Loading...</div>}>
            <UserButton />
          </Suspense>
        </div>
      </nav>
      <MobileHeader />
    </header>
  );
};

export default Header;
