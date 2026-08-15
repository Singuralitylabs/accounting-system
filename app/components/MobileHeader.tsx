"use client";

import Link from "next/link";
import React, { FC, useState } from "react";
import { GiHamburgerMenu } from "react-icons/gi";
import { ProfilesType } from "../types/types";
import { visibleNavItems } from "../utils/permissions";

type Props = {
  profile: ProfilesType | null;
  onSignOut: () => Promise<void>;
  hideNav?: boolean;
};

const MobileHeader: FC<Props> = ({ profile, onSignOut, hideNav = false }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  return (
    <div className="relative">
      <button
        className="text-white focus:outline-none"
        aria-label="Toggle menu"
        onClick={toggleMenu}
      >
        <GiHamburgerMenu size="1.5rem" />
      </button>
      {isMenuOpen && (
        <div className="absolute right-0 top-8 z-[15] w-32 bg-gray-700 text-right">
          {!hideNav &&
            visibleNavItems(profile?.class).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block w-full rounded px-3 py-2 text-right text-white hover:bg-gray-500"
                onClick={toggleMenu}
              >
                {item.label}
              </Link>
            ))}
          <button
            className="block w-full rounded px-3 py-2 text-right text-white hover:bg-gray-500"
            onClick={onSignOut}
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
};

export default MobileHeader;
