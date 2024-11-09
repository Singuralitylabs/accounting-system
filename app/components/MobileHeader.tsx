"use client";

import {
  createClientComponentClient,
  User,
} from "@supabase/auth-helpers-nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { FC, useEffect, useState } from "react";
import { GiHamburgerMenu } from "react-icons/gi";
import { ProfilesType } from "../types/types";
import { getProfileInfo } from "../utils/supabaseServer";

const MobileHeader: FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfilesType | null>(null);

  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const { profileInfo } = await getProfileInfo();
        if (profileInfo) {
          setProfile(profileInfo);
        }
      }
      setLoading(false);
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        const { profileInfo } = await getProfileInfo();
        if (profileInfo) {
          setProfile(profileInfo);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

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
            {profile?.class === "accounting" && (
              <Link
                href="/accounting"
                className="block rounded px-3 py-2 text-white hover:bg-gray-500 text-right w-full"
                onClick={toggleMenu}
              >
                経理用一覧
              </Link>
            )}
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
