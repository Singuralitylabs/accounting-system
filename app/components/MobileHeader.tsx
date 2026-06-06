"use client";

import Link from "next/link";
import React, { FC, useState } from "react";
import { GiHamburgerMenu } from "react-icons/gi";
import { ProfilesType } from "../types/types";
import { visibleNavItems } from "../utils/permissions";

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
            {visibleNavItems(profile?.class).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded px-3 py-2 text-white hover:bg-gray-500 text-right w-full"
                onClick={toggleMenu}
              >
                {item.label}
              </Link>
            ))}
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
