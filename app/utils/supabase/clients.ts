import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/app/lib/database.types";

/**
 * Server Component / Server Action / Route Handler 用の Supabase クライアント。
 * `"use server"` ファイルからは async 関数しか export できないため、
 * このモジュールには `"use server"` を付けない。
 *
 * RSC からの cookie set は失敗するので try/catch で無視する。
 * トークンリフレッシュの Set-Cookie は middleware が担う。
 * Route Handler（`app/auth/callback`）では setAll が実際に効く。
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
            // Server Component からは cookie を書けない
          }
        },
      },
    },
  );
};

/**
 * cron ルート（`app/api/cron/budget-declaration-reminder/route.ts`）限定の
 * server-only な service role クライアント。cron 実行には認証セッション（cookie）が無く
 * createServerSupabase（anon key + RLS）では読めないため、ここだけ RLS をバイパスする
 * service role キーを使う。読み取り専用の用途に限り、キーはこのクライアント外に出さない。
 * 他の用途（Server Component / Server Action / Route Handler の通常アクセス）には
 * createServerSupabase を使うこと。
 */
export const createServiceRoleSupabase = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
