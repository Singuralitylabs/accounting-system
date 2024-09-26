"use server";

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "../lib/database.types";
import { MatterType } from "../types/types";

export const supabaseServer = () => {
  cookies().getAll();
  return createServerComponentClient<Database>({ cookies });
};

export const getUserMatterInfoList = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: matterList } = await supabase.from("matters").select("*");

  return matterList;
};

export const updateMatterInfoInSupabase = async (matterInfo: MatterType) => {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: status, error } = await supabase
    .from("matters")
    .update(matterInfo)
    .eq("id", matterInfo.id);

  return { status, error };
};

export const deleteMatterInfoInSupabase = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: status, error } = await supabase
    .from("matters")
    .delete()
    .eq("id", id);

  return { status, error };
};
