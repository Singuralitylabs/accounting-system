import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@/app/lib/database.types";

/**
 * Server Component / Server Action 用の Supabase クライアント。
 * `"use server"` ファイルからは async 関数しか export できないため、
 * このモジュールには `"use server"` を付けない。
 */
export const createServerSupabase = () =>
  createServerComponentClient<Database>({ cookies });
