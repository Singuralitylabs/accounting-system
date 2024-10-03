"use client";

import Link from "next/link";
import React, { FC, useState } from "react";
import { GiHamburgerMenu } from "react-icons/gi";

const Header: FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  return (
    <header className="bg-gray-800 p-4">
      <nav className="flex justify-between items-center">
        <div className="hidden sm:flex space-x-4">
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
        <div className="ml-auto hidden sm:block">
          <Link
            href="/login"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            ログアウト
          </Link>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div className="sm:hidden flex justify-end w-full">
        <button
          className="text-white sm:hidden focus:outline-none"
          aria-label="Toggle menu"
          onClick={toggleMenu}
        >
          <GiHamburgerMenu size="1.5rem" />
        </button>
      </div>
      <div className="relative md:hidden flex justify-end">
        {isMenuOpen && (
          <div className="absolute bg-gray-700 w-32 text-right ml-auto top-0 z-10">
            <Link
              href="/"
              className="block rounded px-3 py-2 text-white hover:bg-gray-500"
              onClick={toggleMenu}
            >
              全ての案件
            </Link>
            <Link
              href="/completed"
              className="block rounded px-3 py-2 text-white hover:bg-gray-500"
              onClick={toggleMenu}
            >
              完了した案件
            </Link>
            <Link
              href="/new"
              className="block rounded px-3 py-2 text-white hover:bg-gray-500"
              onClick={toggleMenu}
            >
              新規作成
            </Link>
            <Link
              href="/login"
              className="block rounded px-3 py-2 text-white hover:bg-gray-500"
              onClick={toggleMenu}
            >
              ログアウト
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
