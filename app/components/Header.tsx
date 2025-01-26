"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Session } from "@supabase/supabase-js";
import Link from "next/link";
import React, { FC, Suspense, useEffect, useState } from "react";
import { ProfilesType } from "../types/types";
import { getProfileInfoById } from "../utils/supabase/supabaseServer";
import MobileHeader from "./MobileHeader";
import UserButton from "./buttons/user-button";
import { useRouter } from "next/navigation";

interface HeaderProps {
  initialSession: Session | null;
  initialProfile: ProfilesType | null;
}

interface CacheEntry {
  data: ProfilesType;
  timestamp: number;
}

const CACHE_DURATION = 1000 * 60 * 30;

const Header: FC<HeaderProps> = ({ initialSession, initialProfile }) => {
  const [session, setSession] = useState<Session | null>(initialSession);
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
      if (session) {
        setSession(session);

        const cacheEntry = profileCache[session.user.id];
        if (!cacheEntry || !isValidCache(cacheEntry)) {
          const { profileInfo } = await getProfileInfoById(session.user.id);
          if (profileInfo) {
            setProfile(profileInfo);
            setProfileCache((prev) => ({
              ...prev,
              [session.user.id]: { data: profileInfo, timestamp: Date.now() },
            }));
          }
        } else {
          setProfile(cacheEntry.data);
        }
      } else {
        setSession(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  if (!session) {
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
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
