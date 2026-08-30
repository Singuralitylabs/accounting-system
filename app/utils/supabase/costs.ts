"use server";

import { createServerSupabase } from "./clients";

export const getUserCostInfoList = async (matter_id: number) => {
  const supabase = createServerSupabase();

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
  const supabase = createServerSupabase();

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
  const supabase = createServerSupabase();

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
  const supabase = createServerSupabase();

  const { error } = await supabase.from("costs").delete().eq("id", id);

  if (error) {
    console.error(`ID : ${id}のコスト情報の削除処理で失敗しました。`, error);
    return;
  }
};

export const bulkInsertCostInfo = async (
  costs: Array<{
    name: string;
    item: string;
    payment_target: string;
    price: number;
    period: string;
    certificate: string;
    withholding: boolean;
    comment: string | null;
  }>,
  matterId: number
) => {
  if (costs.length === 0) {
    return { error: null };
  }

  const supabase = createServerSupabase();

  const { error } = await supabase.from("costs").insert(
    costs.map((cost) => ({
      name: cost.name,
      item: cost.item,
      payment_target: cost.payment_target,
      price: cost.price,
      period: cost.period === "" ? null : cost.period,
      certificate: cost.certificate,
      withholding: cost.withholding,
      matter_id: matterId,
      comment: cost.comment,
    }))
  );

  if (error) {
    console.error("コスト情報の一括追加処理で失敗しました。", error);
    return { error };
  }

  return { error: null };
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
  const supabase = createServerSupabase();
  
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
