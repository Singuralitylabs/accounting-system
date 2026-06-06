"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { User } from "@supabase/supabase-js";
import Link from "next/link";
import React, { FC, Suspense, useEffect, useState } from "react";
import { ProfilesType } from "../types/types";
import { getProfileInfoById } from "../utils/supabase/supabaseServer";
import MobileHeader from "./MobileHeader";
import UserButton from "./buttons/user-button";
import { useRouter } from "next/navigation";

interface HeaderProps {
  initialUser: User | null;
  initialProfile: ProfilesType | null;
}

interface CacheEntry {
  data: ProfilesType;
  timestamp: number;
}

const CACHE_DURATION = 1000 * 60 * 30;

const Header: FC<HeaderProps> = ({ initialUser, initialProfile }) => {
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<ProfilesType | null>(initialProfile);
  const [profileCache, setProfileCache] = useState<Record<string, CacheEntry>>(
    {}
  );
  const supabase = createClientComponentClient();
  const router = useRouter();

  const isValidCache = (entry: CacheEntry) => {
    return Date.now() - entry.timestamp < CACHE_DURATION;
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // セッションがある場合は、getUser()で再検証
        const {
          data: { user: validatedUser },
        } = await supabase.auth.getUser();

        if (validatedUser) {
          setUser(validatedUser);

          const cacheEntry = profileCache[validatedUser.id];
          if (!cacheEntry || !isValidCache(cacheEntry)) {
            const { profileInfo } = await getProfileInfoById(validatedUser.id);
            if (profileInfo) {
              setProfile(profileInfo);
              setProfileCache((prev) => ({
                ...prev,
                [validatedUser.id]: {
                  data: profileInfo,
                  timestamp: Date.now(),
                },
              }));
            }
          } else {
            setProfile(cacheEntry.data);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, profileCache]);

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
          {(profile?.class === "teamleader" || profile?.class === "admin") && (
            <Link
              href="/team"
              className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
            >
              チーム案件一覧
            </Link>
          )}
          {(profile?.class === "accounting" || profile?.class === "admin") && (
            <Link
              href="/accounting"
              className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
            >
              経理用一覧
            </Link>
          )}
          {(profile?.class === "teamleader" ||
            profile?.class === "accounting" ||
            profile?.class === "admin") && (
            <Link
              href="/profit-loss"
              className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
            >
              損益計算書
            </Link>
          )}
          {(profile?.class === "accounting" || profile?.class === "admin") && (
            <Link
              href="/recurring-costs"
              className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
            >
              定期費用マスタ
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
