"use server";

import { createServerSupabase } from "./clients";

export const getUserBusinessInfoList = async (matter_id: number) => {
  const supabase = createServerSupabase();

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
  const supabase = createServerSupabase();

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
  const supabase = createServerSupabase();

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
  const supabase = createServerSupabase();

  const { error } = await supabase.from("business").delete().eq("id", id);

  if (error) {
    console.error(`ID : ${id}の取引先情報の削除処理で失敗しました。`, error);
    return;
  }
};

export const bulkInsertBusinessInfo = async (
  businesses: Array<{
    name: string;
    amount: number;
    invoice_date: string;
    period_date: string;
  }>,
  matterId: number
) => {
  if (businesses.length === 0) {
    return { error: null };
  }

  const supabase = createServerSupabase();

  const { error } = await supabase.from("business").insert(
    businesses.map((business) => ({
      name: business.name,
      amount: business.amount,
      invoice_date: business.invoice_date,
      period_date: business.period_date,
      matter_id: matterId,
    }))
  );

  if (error) {
    console.error("取引先情報の一括追加処理で失敗しました。", error);
    return { error };
  }

  return { error: null };
};

export const deleteBusinessesByMatterId = async (matterId: number) => {
  const supabase = createServerSupabase();

  const { error } = await supabase
    .from("business")
    .delete()
    .eq("matter_id", matterId);

  if (error) {
    console.error(
      `案件ID : ${matterId}の取引先情報の一括削除処理で失敗しました。`,
      error
    );
    return { error };
  }

  return { error: null };
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
  const supabase = createServerSupabase();
  
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
