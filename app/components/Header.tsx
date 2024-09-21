import Link from "next/link";
import React, { FC } from "react";

const Header: FC = () => {
  return (
    <header className="bg-gray-800 p-4">
      <nav className="flex justify-between items-center">
        <div className="space-x-4">
          <Link
            href="/"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            全ての案件
          </Link>
          <Link
            href="/completed"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            完了した案件
          </Link>
          <Link
            href="/new"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            新規作成
          </Link>
        </div>
        <div className="ml-auto">
          <Link
            href="/login"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            ログアウト
          </Link>
        </div>
      </nav>
    </header>
  );
};

export default Header;
