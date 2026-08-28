"use client";

import { User } from "@supabase/supabase-js";
import Link from "next/link";
import React, { FC, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ProfilesType } from "../types/types";
import { visibleNavItems } from "../utils/permissions";
import { getProfileInfoById } from "../utils/supabase/profiles";
import { useSupabase } from "./providers/SupabaseProvider";
import MobileHeader from "./MobileHeader";
import UserButton from "./buttons/user-button";

interface HeaderProps {
  initialUser: User | null;
  initialProfile: ProfilesType | null;
}

interface CacheEntry {
  data: ProfilesType;
  timestamp: number;
}

const CACHE_DURATION = 1000 * 60 * 30;

const buildInitialProfileCache = (
  initialUser: User | null,
  initialProfile: ProfilesType | null,
): Record<string, CacheEntry> => {
  if (!initialUser?.id || !initialProfile) {
    return {};
  }
  return {
    [initialUser.id]: {
      data: initialProfile,
      timestamp: Date.now(),
    },
  };
};

const Header: FC<HeaderProps> = ({ initialUser, initialProfile }) => {
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<ProfilesType | null>(initialProfile);
  const profileCacheRef = useRef<Record<string, CacheEntry>>();
  if (profileCacheRef.current === undefined) {
    profileCacheRef.current = buildInitialProfileCache(
      initialUser,
      initialProfile,
    );
  }
  const latestUserIdRef = useRef<string | null>(initialUser?.id ?? null);
  const { supabase } = useSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const isHub = pathname === "/";

  const isValidCache = (entry: CacheEntry) => {
    return Date.now() - entry.timestamp < CACHE_DURATION;
  };

  useEffect(() => {
    const pendingTimerIds = new Set<ReturnType<typeof setTimeout>>();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // auth-js のロック保持中に非同期処理を走らせない（公式推奨の回避策）。
      // session.user は名前・アイコン・ナビ表示にのみ使う。認可は middleware / RLS が担う。
      // Header は再マウントされないため、表示更新は本コールバックの session.user が担う。
      const timerId = setTimeout(async () => {
        try {
          if (session?.user) {
            const sessionUser = session.user;
            latestUserIdRef.current = sessionUser.id;
            setUser(sessionUser);

            const cacheEntry = profileCacheRef.current![sessionUser.id];
            if (!cacheEntry || !isValidCache(cacheEntry)) {
              const { profileInfo } = await getProfileInfoById(sessionUser.id);
              if (latestUserIdRef.current !== sessionUser.id) {
                return;
              }
              if (profileInfo) {
                setProfile(profileInfo);
                profileCacheRef.current![sessionUser.id] = {
                  data: profileInfo,
                  timestamp: Date.now(),
                };
              } else {
                setProfile(null);
              }
            } else {
              setProfile(cacheEntry.data);
            }
          } else {
            latestUserIdRef.current = null;
            profileCacheRef.current = {};
            setUser(null);
            setProfile(null);
          }
        } catch (error) {
          console.error(
            "Unexpected error in Header auth state handler:",
            error,
          );
        } finally {
          pendingTimerIds.delete(timerId);
        }
      }, 0);
      pendingTimerIds.add(timerId);
    });

    return () => {
      subscription.unsubscribe();
      pendingTimerIds.forEach(clearTimeout);
      pendingTimerIds.clear();
    };
  }, [supabase]);

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    profileCacheRef.current = {};
    latestUserIdRef.current = null;
    setUser(null);
    setProfile(null);
    router.push("/login");
  };

  return (
    <header className="bg-gray-800 p-4">
      <nav className="flex items-center gap-4">
        <Link
          href="/"
          className="shrink-0 text-lg font-semibold text-white hover:text-gray-300"
        >
          経理システム
        </Link>
        {!isHub && (
          <div className="hidden sm:flex flex-wrap gap-2">
            {visibleNavItems(profile?.class).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
        <div className="hidden sm:flex ml-auto items-center">
          <UserButton user={user} onSignOut={handleSignOut} />
        </div>
        <div className="sm:hidden ml-auto">
          <MobileHeader
            profile={profile}
            onSignOut={handleSignOut}
            hideNav={isHub}
          />
        </div>
      </nav>
    </header>
  );
};

export default Header;
