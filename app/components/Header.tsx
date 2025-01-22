"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { User } from "@supabase/supabase-js";
import Link from "next/link";
import React, { FC, Suspense, useEffect, useState } from "react";
import { ProfilesType } from "../types/types";
import { getProfileInfoById } from "../utils/supabaseServer";
import MobileHeader from "./MobileHeader";
import UserButton from "./buttons/user-button";
import { useRouter } from "next/navigation";

interface HeaderProps {
  initialUser: User | null;
  initialProfile: ProfilesType | null;
}

const Header: FC<HeaderProps> = ({ initialUser, initialProfile }) => {
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<ProfilesType | null>(initialProfile);
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        const { profileInfo } = await getProfileInfoById(session.user.id);
        if (profileInfo) {
          setProfile(profileInfo);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    router.push("/login");
  };

  return (
    <header className="bg-gray-800 p-4">
      <nav className="flex justify-between items-center">
        <div className="hidden sm:flex space-x-4">
          <Link
            href="/"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            案件カード
          </Link>
          <Link
            href="/new"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            新規作成
          </Link>
          {(profile?.class === "accounting" || profile?.class === "admin") && (
            <Link
              href="/accounting"
              className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
            >
              経理用一覧
            </Link>
          )}
          {profile?.class === "admin" && (
            <Link
              href="/dashboard"
              className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
            >
              管理画面
            </Link>
          )}
        </div>
        <div className="hidden sm:flex ml-auto rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500">
          <Suspense fallback={<div>Loading...</div>}>
            <UserButton />
          </Suspense>
        </div>
      </nav>
      <MobileHeader profile={profile} onSignOut={handleSignOut} />
    </header>
  );
};

export default Header;
