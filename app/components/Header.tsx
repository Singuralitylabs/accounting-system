"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { User } from "@supabase/supabase-js";
import Link from "next/link";
import React, { FC, Suspense, useEffect, useState } from "react";
import MobileHeader from "./mobile-header";
import UserButton from "./user-button";

const Header: FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

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
          <Link
            href="/dashboard"
            className="rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500"
          >
            経理用一覧
          </Link>
        </div>
        <div className="hidden sm:flex ml-auto rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-500">
          <Suspense fallback={<div>Loading...</div>}>
            <UserButton />
          </Suspense>
        </div>
      </nav>
      <MobileHeader />
    </header>
  );
};

export default Header;
