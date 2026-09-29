import { cache } from "react";
import { Database } from "../../lib/database.types";
import { createServerSupabase } from "./clients";

// Dedupes auth.getUser() / profile fetches within one request (RSC render) so AuthProvider, pages
// and data functions share one Supabase round trip. Not "use server" (exports must be async
// functions only); exposed through async wrappers in profiles.ts.

type ProfilesRow = Database["public"]["Tables"]["profiles"]["Row"];

// Discriminated union with both properties in both cases so callers can destructure { profileInfo }.
export type ProfileInfoResult =
  | { profileInfo: ProfilesRow; error?: undefined }
  | { profileInfo?: undefined; error: Error };

export const getCachedUser = cache(async () => {
  const supabase = createServerSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error };
});

export const getCachedProfileInfoById = cache(
  async (userId: string): Promise<ProfileInfoResult> => {
  const supabase = createServerSupabase();

  const { data: profileInfo, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

    if (!profileInfo || profileError) {
      console.error("Profile fetch failed:", profileError);
      return { error: new Error("プロファイル情報の取得に失敗しました。") };
    }

    return { profileInfo };
  }
);

export const getCachedProfileInfo = cache(
  async (): Promise<ProfileInfoResult> => {
  const { user, error: userError } = await getCachedUser();

  if (!user || userError) {
    console.error("User authentication failed:", userError);
    return { error: new Error("ユーザー認証情報の取得に失敗しました。") };
  }

  return getCachedProfileInfoById(user.id);
});
