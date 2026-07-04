import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUserMatterInfoList,
  getUserCostInfoList,
  getUserBusinessInfoList,
  getAllMatterInfoList,
  getTeamMatterInfoList,
} from "../utils/supabase/supabaseServer";
import { updateMatter } from "../utils/supabase/editMatterInfo";
import addMatterInfo from "../utils/supabase/addMatterInfo";
import deleteMatter from "../utils/supabase/deleteMatter";
import {
  MatterType,
  CostInCardType,
  BusinessInCardType,
  MatterInfoWithUserNameType,
  BusinessType,
  CostType,
} from "../types/types";

// getAllMatterInfoListの戻り値の型定義
export type MatterWithProfileType = MatterType & {
  profiles: {
    name: string;
    slack_id: string | null;
  } | null;
};

// ユーザーの案件一覧
export const useUserMatterList = (initialData?: MatterType[]) => {
  return useQuery({
    queryKey: ["matters", "user"],
    queryFn: () => getUserMatterInfoList(),
    initialData,
    staleTime: 2 * 60 * 1000, // 2分
  });
};

// 全案件一覧（経理用）
export const useAllMatterList = (initialData?: MatterWithProfileType[]) => {
  return useQuery({
    queryKey: ["matters", "all"],
    queryFn: async () => {
      const result = await getAllMatterInfoList();
      // getAllMatterInfoList はエラー時に null を返す。null をそのまま返すと
      // 成功扱いでキャッシュが null 上書きされ一覧が白紙化するため throw に変換し、
      // TanStack Query の retry と前回データ保持に任せる
      if (result === null) {
        throw new Error("案件一覧の取得に失敗しました");
      }
      return result as MatterWithProfileType[];
    },
    initialData,
    staleTime: 2 * 60 * 1000,
  });
};

// チーム案件一覧
export const useTeamMatterList = () => {
  return useQuery({
    queryKey: ["matters", "team"],
    queryFn: () => getTeamMatterInfoList(),
    staleTime: 2 * 60 * 1000,
  });
};

// 案件詳細（コスト・ビジネス情報含む）
export const useMatterDetail = (matterId: number, enabled = true) => {
  return useQuery({
    queryKey: ["matter", matterId, "details"],
    queryFn: async () => {
      const [costResult, businessResult] = await Promise.all([
        getUserCostInfoList(matterId),
        getUserBusinessInfoList(matterId),
      ]);

      return {
        costs:
          costResult.costInfoList?.map((cost) => ({
            ...cost,
            isNew: false,
            isRemoved: false,
          })) || [],
        businesses:
          businessResult.businessInfoList?.map((business) => ({
            ...business,
            isNew: false,
            isRemoved: false,
          })) || [],
      };
    },
    enabled: enabled && !!matterId,
    staleTime: 1 * 60 * 1000, // 1分（詳細データはより頻繁に更新）
  });
};

// 案件更新
export const useUpdateMatter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      matterInfo: MatterType;
      businessInfoList: BusinessInCardType[];
      costInfoList: CostInCardType[];
    }) =>
      updateMatter(data.matterInfo, data.businessInfoList, data.costInfoList),
    onSuccess: (_, variables) => {
      // 特定の matter だけを無効化
      queryClient.invalidateQueries({
        queryKey: ["matter", variables.matterInfo.id],
      });
      // 一覧も無効化（合計金額などが変わるため）
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("案件更新エラー:", error);
    },
  });
};

// 案件作成
export const useCreateMatter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      matterInfo: MatterType;
      businessInfoList: BusinessInCardType[];
      costInfoList: CostInCardType[];
    }) =>
      addMatterInfo(data.matterInfo, data.businessInfoList, data.costInfoList),
    onSuccess: () => {
      // 全ての案件一覧を無効化
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("案件作成エラー:", error);
    },
  });
};

// 案件削除
export const useDeleteMatter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matter: MatterType) => deleteMatter(matter),
    onSuccess: (_, deletedMatter) => {
      // 削除された案件のキャッシュを削除
      queryClient.removeQueries({ queryKey: ["matter", deletedMatter.id] });
      // 一覧を無効化
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("案件削除エラー:", error);
    },
  });
};

// 楽観的更新用のヘルパー
export const useOptimisticMatterUpdate = () => {
  const queryClient = useQueryClient();

  const updateMatterOptimistically = (
    matterId: number,
    updater: (old: MatterType) => MatterType,
  ) => {
    // ユーザー案件一覧の楽観的更新
    queryClient.setQueryData(
      ["matters", "user"],
      (old: MatterType[] | undefined) => {
        if (!old) return old;
        return old.map((matter) =>
          matter.id === matterId ? updater(matter) : matter,
        );
      },
    );

    // 全案件一覧の楽観的更新
    queryClient.setQueryData(
      ["matters", "all"],
      (old: MatterInfoWithUserNameType[] | undefined) => {
        if (!old) return old;
        return old.map((matter) =>
          matter.id === matterId ? { ...matter, ...updater(matter) } : matter,
        );
      },
    );
  };

  return { updateMatterOptimistically };
};

// Slack通知（案件をis_fixed=falseに戻す）
export const useSlackNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Slack 送信は非冪等な副作用のため、グローバル設定（retry: 1）による
    // mutationFn 全体の自動再実行＝通知の二重送信を防ぐ
    retry: 0,
    mutationFn: async (data: {
      matters: MatterInfoWithUserNameType[];
      message: string;
    }): Promise<{ failedTitles: string[]; dbUpdateFailed: boolean }> => {
      const { matters, message } = data;

      // import はループ内ではなく最初に1回だけ行う
      const [{ default: sendMessageToSlack }, { bulkUnfixMatterInfo }] =
        await Promise.all([
          import("../utils/slack/sendMessageToSlack"),
          import("../utils/supabase/supabaseServer"),
        ]);

      // Server Action は同一クライアントからは直列実行される上、Slack 側の
      // レート制限（概ね1メッセージ/秒）もあるため、送信は明示的に直列で行い、
      // 失敗しても残りの案件の送信は継続する
      const notifiedMatterIds: number[] = [];
      const failedTitles: string[] = [];
      for (const matter of matters) {
        const notified = await sendMessageToSlack(
          matter.slack_id!,
          matter.user_name!,
          matter.title,
          message,
        );
        if (notified) {
          notifiedMatterIds.push(matter.id);
        } else {
          failedTitles.push(matter.title);
        }
      }

      // 通知できた案件のみ、一括UPDATEで is_fixed=false に戻す。
      // 部分失敗は throw せず戻り値で返す（throw すると DB 更新済みなのに
      // キャッシュ無効化されず、UI が DB と乖離するため）
      let dbUpdateFailed = false;
      if (notifiedMatterIds.length > 0) {
        const { error } = await bulkUnfixMatterInfo(notifiedMatterIds);
        if (error) {
          console.error("案件の一括差し戻しに失敗しました:", error);
          dbUpdateFailed = true;
        }
      }

      return { failedTitles, dbUpdateFailed };
    },
    onSettled: () => {
      // 部分失敗でも DB が更新されている可能性があるため、成否によらず無効化する
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("Slack通知エラー:", error);
    },
  });
};

// 確認完了処理（複数案件）
export const useCheckCompleted = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (matters: MatterInfoWithUserNameType[]) => {
      const checkMatterInfoList = (
        await import("../utils/supabase/checkMatterInfoList")
      ).default;
      await checkMatterInfoList(matters);
    },
    onSuccess: () => {
      // 全ての案件一覧を無効化
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("確認完了エラー:", error);
    },
  });
};

// 確認完了処理（単一案件）
export const useCheckCompletedSingle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      matterInfo: MatterInfoWithUserNameType;
      businessList: BusinessType[];
      costList: CostType[];
      accountingMemo?: string;
      clearHasUpdates?: boolean;
    }) => {
      const { updateMatter } = await import("../utils/supabase/editMatterInfo");

      const matterToUpdate: MatterType = {
        id: data.matterInfo.id,
        title: data.matterInfo.title,
        category: data.matterInfo.category,
        team: data.matterInfo.team,
        start_date: data.matterInfo.start_date,
        description: data.matterInfo.description,
        total_amount: data.matterInfo.total_amount,
        business_count: data.matterInfo.business_count,
        total_cost: data.matterInfo.total_cost,
        cost_count: data.matterInfo.cost_count,
        unchecked_cost_count: data.matterInfo.unchecked_cost_count,
        parent_matter_id: data.matterInfo.parent_matter_id,
        is_fixed: data.matterInfo.is_fixed,
        is_completed: true, // 確認完了
        has_updates: data.clearHasUpdates ? false : data.matterInfo.has_updates,
        user_id: data.matterInfo.user_id,
        accounting_memo: data.accountingMemo || data.matterInfo.accounting_memo,
        inserted_at: data.matterInfo.inserted_at,
        updated_at: data.matterInfo.updated_at,
      };

      // BusinessTypeとCostTypeをBusinessInCardTypeとCostInCardTypeに変換
      const businessInCardList: BusinessInCardType[] = data.businessList.map(
        (business) => ({
          ...business,
          isNew: false,
          isRemoved: false,
        }),
      );

      const costInCardList: CostInCardType[] = data.costList.map((cost) => ({
        ...cost,
        isNew: false,
        isRemoved: false,
      }));

      // updateMatterを使用してビジネス情報とコスト情報も同時に更新
      await updateMatter(matterToUpdate, businessInCardList, costInCardList);

      return true;
    },
    onSuccess: (_, variables) => {
      // 特定の matter だけを無効化
      queryClient.invalidateQueries({
        queryKey: ["matter", variables.matterInfo.id],
      });
      // 一覧も無効化
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("確認完了エラー:", error);
    },
  });
};

// 経理メモ保存処理（確認完了はしない）
export const useSaveAccountingMemo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      matterInfo: MatterInfoWithUserNameType;
      businessList: BusinessType[];
      costList: CostType[];
      accountingMemo?: string;
      clearHasUpdates?: boolean;
    }) => {
      const { updateMatter } = await import("../utils/supabase/editMatterInfo");

      const matterToUpdate: MatterType = {
        id: data.matterInfo.id,
        title: data.matterInfo.title,
        category: data.matterInfo.category,
        team: data.matterInfo.team,
        start_date: data.matterInfo.start_date,
        description: data.matterInfo.description,
        total_amount: data.matterInfo.total_amount,
        business_count: data.matterInfo.business_count,
        total_cost: data.matterInfo.total_cost,
        cost_count: data.matterInfo.cost_count,
        unchecked_cost_count: data.matterInfo.unchecked_cost_count,
        parent_matter_id: data.matterInfo.parent_matter_id,
        is_fixed: data.matterInfo.is_fixed,
        is_completed: data.matterInfo.is_completed, // 現在の状態を維持
        has_updates: data.clearHasUpdates ? false : data.matterInfo.has_updates,
        user_id: data.matterInfo.user_id,
        accounting_memo: data.accountingMemo || data.matterInfo.accounting_memo,
        inserted_at: data.matterInfo.inserted_at,
        updated_at: data.matterInfo.updated_at,
      };

      // BusinessTypeとCostTypeをBusinessInCardTypeとCostInCardTypeに変換
      const businessInCardList: BusinessInCardType[] = data.businessList.map(
        (business) => ({
          ...business,
          isNew: false,
          isRemoved: false,
        }),
      );

      const costInCardList: CostInCardType[] = data.costList.map((cost) => ({
        ...cost,
        isNew: false,
        isRemoved: false,
      }));

      // updateMatterを使用してビジネス情報とコスト情報も同時に更新
      await updateMatter(matterToUpdate, businessInCardList, costInCardList);

      return true;
    },
    onSuccess: (_, variables) => {
      // 特定の matter だけを無効化
      queryClient.invalidateQueries({
        queryKey: ["matter", variables.matterInfo.id],
      });
      // 一覧も無効化
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("保存エラー:", error);
    },
  });
};

// 申請中に戻す処理
export const useRevertToFixed = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      matterInfo: MatterInfoWithUserNameType;
      accountingMemo?: string;
      clearHasUpdates?: boolean;
    }) => {
      const { updateMatterInfo } =
        await import("../utils/supabase/supabaseServer");

      const matterToUpdate: MatterType = {
        id: data.matterInfo.id,
        title: data.matterInfo.title,
        category: data.matterInfo.category,
        team: data.matterInfo.team,
        start_date: data.matterInfo.start_date,
        description: data.matterInfo.description,
        total_amount: data.matterInfo.total_amount,
        business_count: data.matterInfo.business_count,
        total_cost: data.matterInfo.total_cost,
        cost_count: data.matterInfo.cost_count,
        unchecked_cost_count: data.matterInfo.unchecked_cost_count,
        parent_matter_id: data.matterInfo.parent_matter_id,
        is_fixed: true, // 申請中に戻す
        is_completed: false, // 確認完了を取り消し
        has_updates: data.clearHasUpdates ? false : data.matterInfo.has_updates,
        user_id: data.matterInfo.user_id,
        accounting_memo: data.accountingMemo || data.matterInfo.accounting_memo,
        inserted_at: data.matterInfo.inserted_at,
        updated_at: data.matterInfo.updated_at,
      };

      const result = await updateMatterInfo(matterToUpdate);

      if (result.error) {
        throw new Error(
          `データベース更新に失敗しました: ${result.error.message}`,
        );
      }

      return result;
    },
    onSuccess: () => {
      // 全ての案件一覧を無効化
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("申請中に戻すエラー:", error);
    },
  });
};

// 下書きに戻す処理
export const useRevertToDraft = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      matterInfo: MatterInfoWithUserNameType;
      accountingMemo?: string;
      clearHasUpdates?: boolean;
    }) => {
      const { updateMatterInfo } =
        await import("../utils/supabase/supabaseServer");

      const matterToUpdate: MatterType = {
        id: data.matterInfo.id,
        title: data.matterInfo.title,
        category: data.matterInfo.category,
        team: data.matterInfo.team,
        start_date: data.matterInfo.start_date,
        description: data.matterInfo.description,
        total_amount: data.matterInfo.total_amount,
        business_count: data.matterInfo.business_count,
        total_cost: data.matterInfo.total_cost,
        cost_count: data.matterInfo.cost_count,
        unchecked_cost_count: data.matterInfo.unchecked_cost_count,
        parent_matter_id: data.matterInfo.parent_matter_id,
        is_fixed: false, // 下書きに戻す
        is_completed: false, // 確認完了を取り消し
        has_updates: data.clearHasUpdates ? false : data.matterInfo.has_updates,
        user_id: data.matterInfo.user_id,
        accounting_memo: data.accountingMemo || data.matterInfo.accounting_memo,
        inserted_at: data.matterInfo.inserted_at,
        updated_at: data.matterInfo.updated_at,
      };

      const result = await updateMatterInfo(matterToUpdate);

      if (result.error) {
        throw new Error(
          `データベース更新に失敗しました: ${result.error.message}`,
        );
      }

      return result;
    },
    onSuccess: () => {
      // 全ての案件一覧を無効化
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("下書きに戻すエラー:", error);
    },
  });
};
