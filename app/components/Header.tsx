"use client";

import { User } from "@supabase/supabase-js";
import Link from "next/link";
import React, { FC, Suspense, useEffect, useState } from "react";
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

const Header: FC<HeaderProps> = ({ initialUser, initialProfile }) => {
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<ProfilesType | null>(initialProfile);
  const [profileCache, setProfileCache] = useState<Record<string, CacheEntry>>(
    {},
  );
  const { supabase } = useSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const isHub = pathname === "/";

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
        <div className="hidden sm:flex ml-auto rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500">
          <Suspense fallback={<div>Loading...</div>}>
            <UserButton />
          </Suspense>
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
