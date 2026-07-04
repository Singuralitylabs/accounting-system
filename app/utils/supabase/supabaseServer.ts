"use server";

import {
  createServerComponentClient,
  User,
} from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "../../lib/database.types";
import { MatterType, ProfilesType } from "../../types/types";
import { isAllowedEmailDomain } from "../constants";
import { getCachedProfileInfo, getCachedProfileInfoById } from "./requestCache";
import { getActiveSelectOptionsByType } from "./selectOptionsCache";

export const getProfileInfo = async () => {
  try {
    return await getCachedProfileInfo();
  } catch (error) {
    console.error("Unexpected error in getProfileInfo:", error);
    return { error: new Error("予期せぬエラーが発生しました。") };
  }
};

export const getProfileInfoById = async (userId: string) => {
  try {
    return await getCachedProfileInfoById(userId);
  } catch (error) {
    console.error("Unexpected error in getProfileInfo:", error);
    return { error: new Error("予期せぬエラーが発生しました。") };
  }
};

export const getAllUserInfo = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: userInfoList } = await supabase
    .from("profiles")
    .select("*")
    .order("id", { ascending: true });

  return userInfoList ? userInfoList : [];
};

export const insertUserInfo = async ({
  user,
  name,
  email,
}: {
  user: User;
  name: string;
  email: string;
}) => {
  // 多層防御: 呼び出し元（OAuth コールバック）でもドメイン検証しているが、
  // プロフィール作成の最終段でも許可ドメイン外を弾く。
  if (!isAllowedEmailDomain(email)) {
    console.warn(`許可されていないドメインのプロフィール作成を拒否しました: ${email}`);
    return { error: new Error("許可されていないドメインのメールアドレスです。") };
  }

  const supabase = createServerComponentClient<Database>({ cookies });

  try {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert([
        {
          user_id: user.id,
          email: email,
          name: name,
          class: "public",
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error(
        `profilesテーブルへの${name}の追加処理で失敗しました。`,
        insertError
      );
      return { error: insertError };
    }

    return { error: null };
  } catch (error) {
    console.error("Unexpected error during insert:", error);
    return { error };
  }
};

export const updateUserInfo = async ({
  profile,
}: {
  profile: ProfilesType;
}) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  try {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        slack_id: profile.slack_id,
        class: profile.class,
        team: profile.team,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)
      .select();

    if (updateError) {
      console.error(
        `profilesテーブルへの${profile.id}の更新処理で失敗しました。`,
        updateError
      );
      return { error: updateError };
    }

    return { error: null };
  } catch (error) {
    console.error("Unexpected error during update Profile:", error);
    return { error };
  }
};

export const getAllMatterInfoList = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: matterList, error } = await supabase
    .from("matters")
    .select(
      `
      *,
      profiles!matters_user_id_fkey (
        name,
        slack_id
      )
    `
    )
    .order("is_completed", { ascending: true })
    .order("is_fixed", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    console.error("Error fetching matters:", error);
    return null;
  }

  return matterList;
};

export const getUserMatterInfoList = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { profileInfo: profileInfo, error } = await getProfileInfo();
  if (error || !profileInfo) {
    console.error("profiles情報の取得処理で失敗しました。", error);
    return null;
  }

  const { data: matterList, error: matterError } = await supabase
    .from("matters")
    .select("*")
    .eq("user_id", profileInfo.id)
    .order("is_fixed", { ascending: true })
    .order("is_completed", { ascending: true })
    .order("id", { ascending: true });

  if (matterError) {
    console.error("案件情報の取得に失敗しました:", matterError);
    return null;
  }

  return matterList;
};

export const getTeamMatterInfoList = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { profileInfo, error } = await getProfileInfo();
  if (error || !profileInfo) {
    console.error("profiles情報の取得処理で失敗しました。", error);
    return null;
  }

  if (
    !["teamleader", "admin"].includes(profileInfo.class!) ||
    !profileInfo.team
  ) {
    return null;
  }

  const { data: matterList, error: matterError } = await supabase
    .from("matters")
    .select(
      `
      *,
      profiles!matters_user_id_fkey (
        name,
        slack_id
      )
    `
    )
    .eq("team", profileInfo.team)
    .order("is_completed", { ascending: true })
    .order("is_fixed", { ascending: false })
    .order("id", { ascending: true });

  if (matterError) {
    console.error("チーム案件情報の取得に失敗しました:", matterError);
    return null;
  }

  return matterList;
};

export const getCompletedUserMatterInfoList = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: matterList } = await supabase
    .from("matters")
    .select("*")
    .eq("is_completed", true);

  return matterList;
};

export const insertMatterInfo = async (
  title: string,
  category: string,
  team: string,
  start_date: string,
  is_fixed: boolean,
  total_amount: number,
  business_count: number,
  total_cost: number,
  cost_count: number,
  description: string | null
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { profileInfo: profileInfo, error } = await getProfileInfo();
  if (error || !profileInfo) {
    console.error("profiles情報の取得処理で失敗しました。", error);
    return { error: new Error("プロフィール情報の取得に失敗しました。") };
  }

  try {
    const { data, error: insertError } = await supabase
      .from("matters")
      .insert({
        title: title,
        category: category,
        team: team,
        start_date: start_date,
        description: description,
        total_amount: total_amount,
        business_count: business_count,
        total_cost: total_cost,
        cost_count: cost_count,
        unchecked_cost_count: cost_count,
        is_fixed: is_fixed,
        is_completed: false,
        has_updates: false,
        user_id: profileInfo.id,
        inserted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error(`案件${title}の追加処理で失敗しました。`, insertError);
      return { error: insertError };
    }

    const newId = data ? data.id : null;

    return { newId, error: null };
  } catch (err) {
    console.error(`予期せぬエラーが発生しました。`, err);
    return { err };
  }
};

export const updateMatterInfo = async (matterInfo: MatterType) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: status, error } = await supabase
    .from("matters")
    .update(matterInfo)
    .eq("id", matterInfo.id)
    .select();

  if (error) {
    console.error(
      `${matterInfo.title}の案件情報の更新処理で失敗しました。`,
      error
    );
    return { status: null, error };
  }

  return { status, error };
};

export const deleteMatterInfo = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: status, error } = await supabase
    .from("matters")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(`案件ID : ${id}の案件情報の削除処理で失敗しました。`, error);
    return { status, error };
  }

  return { status, error };
};

export const getUserCostInfoList = async (matter_id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: costInfoList, error } = await supabase
    .from("costs")
    .select("*")
    .eq("matter_id", matter_id)
    .order("id", { ascending: true });

  return { costInfoList, error };
};

export const updateCostInfo = async (
  id: number,
  name: string,
  item: string,
  payment_target: string,
  price: number,
  period: string,
  certificate: string,
  withholding: boolean,
  matter_id: number,
  comment: string,
  is_completed: boolean
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const formattedPeriod = period
    ? new Date(period).toISOString().split("T")[0]
    : null;

  const { error } = await supabase
    .from("costs")
    .update({
      name: name,
      item: item,
      payment_target: payment_target,
      price: price,
      period: formattedPeriod,
      certificate: certificate,
      withholding: withholding,
      matter_id: matter_id,
      comment: comment,
      is_completed: is_completed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error(`ID : ${id}のコスト情報の更新処理で失敗しました。`, error);
    return;
  }
};

export const insertCostInfo = async (
  name: string,
  item: string,
  payment_target: string,
  price: number,
  period: string,
  certificate: string,
  withholding: boolean,
  matter_id: number,
  comment: string
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase
    .from("costs")
    .insert({
      name: name,
      item: item,
      payment_target: payment_target,
      price: price,
      period: period === "" ? null : period,
      certificate: certificate,
      withholding: withholding,
      matter_id: matter_id,
      comment: comment,
    })
    .select();

  if (error) {
    console.error(`${name}のコスト情報の追加処理で失敗しました。`, error);
    return { error };
  }

  return { error };
};

export const deleteCostInfo = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase.from("costs").delete().eq("id", id);

  if (error) {
    console.error(`ID : ${id}のコスト情報の削除処理で失敗しました。`, error);
    return;
  }
};

export const getUserBusinessInfoList = async (matter_id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: businessInfoList, error } = await supabase
    .from("business")
    .select("*")
    .eq("matter_id", matter_id)
    .order("id", { ascending: true });

  return { businessInfoList, error };
};

export const insertBusinessInfo = async (
  name: string,
  amount: number,
  invoice_date: string,
  period_date: string,
  matter_id: number
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase
    .from("business")
    .insert({
      name: name,
      amount: amount,
      invoice_date: invoice_date,
      period_date: period_date,
      matter_id: matter_id,
    })
    .select();

  if (error) {
    console.error(`${name}の取引先情報の追加処理で失敗しました。`, error);
    return { error };
  }

  return { error };
};

export const updateBusinessInfo = async (
  id: number,
  name: string,
  amount: number,
  invoice_date: string,
  period_date: string,
  matter_id: number,
  is_completed: boolean
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const formattedInvoice = invoice_date
    ? new Date(invoice_date).toISOString().split("T")[0]
    : null;

  const formattedPeriod = period_date
    ? new Date(period_date).toISOString().split("T")[0]
    : null;

  const { error } = await supabase
    .from("business")
    .update({
      name: name,
      amount: amount,
      invoice_date: formattedInvoice,
      period_date: formattedPeriod,
      matter_id: matter_id,
      is_completed: is_completed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error(`ID : ${id}の取引先情報の更新処理で失敗しました。`, error);
    return;
  }
};

export const deleteBusinessInfo = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase.from("business").delete().eq("id", id);

  if (error) {
    console.error(`ID : ${id}の取引先情報の削除処理で失敗しました。`, error);
    return;
  }
};

// 有効な選択肢の取得。実装は getActiveSelectOptionsByType（join による1クエリ＋
// リクエスト内キャッシュ）に一本化しており、これはその種類別ラッパー。
export const getSelectOptions = async (typeName: string) => {
  const optionsByType = await getActiveSelectOptionsByType([typeName]);

  return { options: optionsByType[typeName] ?? [], error: null };
};

export const insertSelectOption = async (
  typeName: string,
  value: string,
  display_order: number
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: typeData, error: typeError } = await supabase
    .from("select_option_types")
    .select("id")
    .eq("name", typeName)
    .single();

  if (typeError || !typeData) {
    console.error(`選択肢の種類の取得に失敗しました: ${typeName}`, typeError);
    return false;
  }

  const { error } = await supabase.from("select_options").insert({
    type_id: typeData.id,
    value,
    display_order,
    is_active: true,
  });

  if (error) {
    console.error(`選択肢の追加に失敗しました`, error);
    return false;
  }

  return true;
};

export const updateSelectOption = async (
  id: number,
  value: string,
  display_order: number,
  is_active: boolean
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase
    .from("select_options")
    .update({
      value,
      display_order,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error(`選択肢の更新に失敗しました: ${id}`, error);
    return false;
  }

  return true;
};

// バルク操作関数

export const bulkUpsertCostInfo = async (
  costs: Array<{
    id?: number;
    name: string;
    item: string;
    payment_target: string;
    price: number;
    period: string | null;
    certificate: string;
    withholding: boolean;
    matter_id: number;
    comment: string | null;
    is_completed?: boolean;
    isNew?: boolean;
    isRemoved?: boolean;
  }>,
  matterId: number
) => {
  const supabase = createServerComponentClient<Database>({ cookies });
  
  // 新規作成用
  const newCosts = costs.filter(c => c.isNew && !c.isRemoved);
  // 更新用  
  const updateCosts = costs.filter(c => !c.isNew && !c.isRemoved);
  // 削除用
  const deleteCosts = costs.filter(c => c.isRemoved && !c.isNew);
  
  const operations = [];
  
  // バルクINSERT
  if (newCosts.length > 0) {
    const insertData = newCosts.map(cost => ({
      name: cost.name,
      item: cost.item,
      payment_target: cost.payment_target,
      price: cost.price,
      period: cost.period === "" ? null : cost.period,
      certificate: cost.certificate,
      withholding: cost.withholding,
      matter_id: matterId,
      comment: cost.comment ?? "",
      is_completed: false
    }));
    
    operations.push(
      supabase.from("costs").insert(insertData)
    );
  }
  
  // バルクUPDATE
  if (updateCosts.length > 0) {
    const updatePromises = updateCosts.map(cost => {
      if (!cost.id) {
        throw new Error('更新対象のコストIDが見つかりません');
      }
      
      const formattedPeriod = cost.period
        ? new Date(cost.period).toISOString().split("T")[0]
        : null;
        
      return supabase
        .from("costs")
        .update({
          name: cost.name,
          item: cost.item,
          payment_target: cost.payment_target,
          price: cost.price,
          period: formattedPeriod,
          certificate: cost.certificate,
          withholding: cost.withholding,
          matter_id: matterId,
          comment: cost.comment ?? "",
          is_completed: cost.is_completed ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cost.id);
    });
    operations.push(...updatePromises);
  }
  
  // バルクDELETE
  if (deleteCosts.length > 0) {
    const deleteIds = deleteCosts.map(c => c.id).filter(id => id !== undefined);
    if (deleteIds.length > 0) {
      operations.push(
        supabase.from("costs").delete().in('id', deleteIds)
      );
    }
  }
  
  // 全て並列実行
  if (operations.length > 0) {
    const results = await Promise.all(operations);
    const errors = results.filter(result => result.error).map(result => result.error);
    
    if (errors.length > 0) {
      console.error('コスト情報のバルク操作でエラーが発生しました:', errors);
      throw new Error('コスト情報の更新に失敗しました');
    }
  }
  
  return true;
};

export const bulkUpsertBusinessInfo = async (
  businesses: Array<{
    id?: number;
    name: string;
    amount: number | null;
    invoice_date: string | null;
    period_date: string | null;
    matter_id: number;
    is_completed?: boolean;
    isNew?: boolean;
    isRemoved?: boolean;
  }>,
  matterId: number
) => {
  const supabase = createServerComponentClient<Database>({ cookies });
  
  // 新規作成用
  const newBusinesses = businesses.filter(b => b.isNew && !b.isRemoved);
  // 更新用  
  const updateBusinesses = businesses.filter(b => !b.isNew && !b.isRemoved);
  // 削除用
  const deleteBusinesses = businesses.filter(b => b.isRemoved && !b.isNew);
  
  const operations = [];
  
  // バルクINSERT
  if (newBusinesses.length > 0) {
    const insertData = newBusinesses.map(business => ({
      name: business.name,
      amount: business.amount!,
      invoice_date: business.invoice_date!,
      period_date: business.period_date!,
      matter_id: matterId,
      is_completed: false
    }));
    
    operations.push(
      supabase.from("business").insert(insertData)
    );
  }
  
  // バルクUPDATE
  if (updateBusinesses.length > 0) {
    const updatePromises = updateBusinesses.map(business => {
      if (!business.id) {
        throw new Error('更新対象のビジネスIDが見つかりません');
      }
      
      const formattedInvoice = business.invoice_date
        ? new Date(business.invoice_date).toISOString().split("T")[0]
        : null;
      const formattedPeriod = business.period_date
        ? new Date(business.period_date).toISOString().split("T")[0]
        : null;
        
      return supabase
        .from("business")
        .update({
          name: business.name,
          amount: business.amount!,
          invoice_date: formattedInvoice,
          period_date: formattedPeriod,
          matter_id: matterId,
          is_completed: business.is_completed ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", business.id);
    });
    operations.push(...updatePromises);
  }
  
  // バルクDELETE
  if (deleteBusinesses.length > 0) {
    const deleteIds = deleteBusinesses.map(b => b.id).filter(id => id !== undefined);
    if (deleteIds.length > 0) {
      operations.push(
        supabase.from("business").delete().in('id', deleteIds)
      );
    }
  }
  
  // 全て並列実行
  if (operations.length > 0) {
    const results = await Promise.all(operations);
    const errors = results.filter(result => result.error).map(result => result.error);
    
    if (errors.length > 0) {
      console.error('ビジネス情報のバルク操作でエラーが発生しました:', errors);
      throw new Error('ビジネス情報の更新に失敗しました');
    }
  }
  
  return true;
};
