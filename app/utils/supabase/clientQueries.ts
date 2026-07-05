import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Database } from "../../lib/database.types";

// 読み取り専用のクライアント直接クエリ集。
//
// 一覧・詳細の読み取りを Server Action（POST・同一クライアントからは直列実行・
// キャッシュ不可）経由で行うとページ表示のボトルネックになるため、
// ブラウザから Supabase へ直接クエリする。サーバー経由と同じユーザーの JWT を
// 使うため、RLS により取得できる行は従来と同一（権限は RLS が担保する）。
//
// 書き込みは従来どおり supabaseServer.ts などの Server Action を使うこと。
// 認証スタックは auth-helpers で統一されているため、ここでも必ず
// createClientComponentClient を使う（@supabase/ssr を混在させない。CLAUDE.md 参照）。

const client = () => createClientComponentClient<Database>();

// ローカルのセッション情報から auth UID を取得する（ネットワーク往復なし）
const getSessionUserId = async () => {
  const {
    data: { session },
  } = await client().auth.getSession();

  if (!session) {
    throw new Error("ログインセッションが見つかりません。");
  }

  return session.user.id;
};

// 自分が担当の案件一覧。
// profiles との inner join で auth UID から直接絞り込み、1クエリで取得する
// （従来の「プロフィール取得 → 案件取得」の2段直列を解消）
export const fetchUserMatterList = async () => {
  const userId = await getSessionUserId();

  const { data, error } = await client()
    .from("matters")
    .select("*, profiles!matters_user_id_fkey!inner(user_id)")
    .eq("profiles.user_id", userId)
    .order("is_fixed", { ascending: true })
    .order("is_completed", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("案件情報の取得に失敗しました:", error);
    throw new Error("案件情報の取得に失敗しました");
  }

  // 絞り込み用に埋め込んだ profiles は返却データから除去する
  return data.map(({ profiles: _profiles, ...matter }) => matter);
};

// 全案件一覧（経理用）。RLS により accounting / admin 以外には自分の行しか返らない
export const fetchAllMatterList = async () => {
  const { data, error } = await client()
    .from("matters")
    .select("*, profiles!matters_user_id_fkey(name, slack_id)")
    .order("is_completed", { ascending: true })
    .order("is_fixed", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    console.error("案件一覧の取得に失敗しました:", error);
    throw new Error("案件一覧の取得に失敗しました");
  }

  return data;
};

// 案件に紐づくコスト一覧
export const fetchMatterCostList = async (matterId: number) => {
  const { data, error } = await client()
    .from("costs")
    .select("*")
    .eq("matter_id", matterId)
    .order("id", { ascending: true });

  if (error) {
    console.error("コスト情報の取得に失敗しました:", error);
    throw new Error("コスト情報の取得に失敗しました");
  }

  return data;
};

// 案件に紐づく取引先一覧
export const fetchMatterBusinessList = async (matterId: number) => {
  const { data, error } = await client()
    .from("business")
    .select("*")
    .eq("matter_id", matterId)
    .order("id", { ascending: true });

  if (error) {
    console.error("取引先情報の取得に失敗しました:", error);
    throw new Error("取引先情報の取得に失敗しました");
  }

  return data;
};

// 定期費用一覧
export const fetchRecurringCostList = async () => {
  const { data, error } = await client()
    .from("recurring_costs")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("定期費用情報の取得に失敗しました:", error);
    throw new Error("定期費用情報の取得に失敗しました");
  }

  return data;
};

// 経理追加収支一覧
export const fetchExtraEntryList = async () => {
  const { data, error } = await client()
    .from("extra_entries")
    .select("*")
    .order("entry_date", { ascending: false, nullsFirst: true })
    .order("id", { ascending: false });

  if (error) {
    console.error("経理追加収支情報の取得に失敗しました:", error);
    throw new Error("経理追加収支情報の取得に失敗しました");
  }

  return data;
};
