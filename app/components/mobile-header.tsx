"use client";

import Link from "next/link";
import React, { FC, useState } from "react";
import { GiHamburgerMenu } from "react-icons/gi";
import UserButton from "./user-button";

const MobileHeader: FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  return (
    <div>
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
              {/* @ts-expect-error Server Component */}
              <UserButton />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileHeader;
