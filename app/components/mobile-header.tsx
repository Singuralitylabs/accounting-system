"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { FC, useState } from "react";
import { GiHamburgerMenu } from "react-icons/gi";

const MobileHeader: FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const supabase = createClientComponentClient();
  const router = useRouter();

  const toggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();

    router.push("/login");
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
            <Link
              href="/dashboard"
              className="block rounded px-3 py-2 text-white hover:bg-gray-500 text-right w-full"
              onClick={toggleMenu}
            >
              経理用一覧
            </Link>
            <button
              className="block rounded px-3 py-2 text-white hover:bg-gray-500 text-right w-full"
              onClick={handleSignOut}
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
