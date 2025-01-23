"use client";

import Link from "next/link";
import React, { FC, useState } from "react";
import { GiHamburgerMenu } from "react-icons/gi";
import { ProfilesType } from "../types/types";

type Props = {
  profile: ProfilesType | null;
  onSignOut: () => Promise<void>;
};

const MobileHeader: FC<Props> = ({ profile, onSignOut }) => {
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
          <div className="absolute bg-gray-700 w-32 text-right ml-auto top-0 z-[15]">
            <Link
              href="/"
              className="block rounded px-3 py-2 text-white hover:bg-gray-500 text-right w-full"
              onClick={toggleMenu}
            >
              案件カード
            </Link>
            <Link
              href="/new"
              className="block rounded px-3 py-2 text-white hover:bg-gray-500 text-right w-full"
              onClick={toggleMenu}
            >
              新規作成
            </Link>
            {(profile?.class === "accounting" ||
              profile?.class === "admin") && (
              <Link
                href="/accounting"
                className="block rounded px-3 py-2 text-white hover:bg-gray-500 text-right w-full"
                onClick={toggleMenu}
              >
                経理用一覧
              </Link>
            )}
            {profile?.class === "admin" && (
              <Link
                href="/dashboard"
                className="block rounded px-3 py-2 text-white hover:bg-gray-500 text-right w-full"
                onClick={toggleMenu}
              >
                管理画面
              </Link>
            )}
            <button
              className="block rounded px-3 py-2 text-white hover:bg-gray-500 text-right w-full"
              onClick={onSignOut}
            >
              ログアウト
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileHeader;
