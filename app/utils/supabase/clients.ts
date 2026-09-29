import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/app/lib/database.types";
import { createPostgrestFetch } from "./postgrestFetch";

/**
 * Supabase client for Server Components / Server Actions / Route Handlers. No `"use server"` here:
 * such files may only export async functions.
 * Cookie sets from RSC fail and are ignored (middleware handles the refresh Set-Cookie); in Route
 * Handlers (`app/auth/callback`) setAll works.
 */
export const createServerSupabase = () => {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // RSC cannot set cookies; middleware handles the refresh.
          }
        },
      },
      global: { fetch: createPostgrestFetch() },
    },
  );
};

/**
 * Server-only service-role client for the cron route (`app/api/cron/budget-declaration-reminder/route.ts`)
 * only: cron has no session cookie, so the anon key + RLS cannot read. Bypasses RLS, so use for
 * read-only purposes and never expose the key. Use createServerSupabase everywhere else.
 */
export const createServiceRoleSupabase = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: { fetch: createPostgrestFetch() },
    },
  );
