import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUserMatterInfoList,
  getAllMatterInfoList,
} from "../utils/supabase/matters";
import { getUserCostInfoList } from "../utils/supabase/costs";
import { getUserBusinessInfoList } from "../utils/supabase/businesses";
import { updateMatter } from "../utils/supabase/editMatterInfo";
import addMatterInfo from "../utils/supabase/addMatterInfo";
import deleteMatter from "../utils/supabase/deleteMatter";
import {
  hasMatterListFilters,
  MatterListFilters,
} from "../utils/matterListFilters";
import {
  getMatterValidationMessage,
  normalizeMatterStartDate,
  validateMatterPayload,
} from "../utils/matterValidation";
import { notifyError, notifySuccess, toErrorMessage } from "../utils/notify";
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
    queryFn: async () => {
      const result = await getUserMatterInfoList();
      // getUserMatterInfoList はエラー時に null を返す。null をそのまま返すと
      // 成功扱いでキャッシュされリトライされないため throw に変換し、
      // TanStack Query の retry と前回データ保持に任せる（useAllMatterList と統一）
      if (result === null) {
        throw new Error("案件情報の取得に失敗しました");
      }
      return result;
    },
    initialData,
    staleTime: 2 * 60 * 1000, // 2分
  });
};

// 全案件一覧（経理用）
export const useAllMatterList = (
  initialData?: MatterWithProfileType[],
  filters: MatterListFilters = {},
) => {
  return useQuery({
    queryKey: ["matters", "all", filters],
    queryFn: async () => {
      const result = await getAllMatterInfoList(filters);
      // getAllMatterInfoList はエラー時に null を返す。null をそのまま返すと
      // 成功扱いでキャッシュが null 上書きされ一覧が白紙化するため throw に変換し、
      // TanStack Query の retry と前回データ保持に任せる
      if (result === null) {
        throw new Error("案件一覧の取得に失敗しました");
      }
      return result as MatterWithProfileType[];
    },
    initialData: hasMatterListFilters(filters) ? undefined : initialData,
    staleTime: 2 * 60 * 1000,
  });
};

// 案件詳細（コスト・ビジネス情報含む）
export const useMatterDetail = (
  matterId: number,
  enabled = true,
  options?: { staleTime?: number; refetchOnMount?: boolean | "always" },
) => {
  return useQuery({
    queryKey: ["matter", matterId, "details"],
    queryFn: async () => {
      const [costResult, businessResult] = await Promise.all([
        getUserCostInfoList(matterId),
        getUserBusinessInfoList(matterId),
      ]);

      // 取得失敗（error あり）を空配列にフォールバックすると「成功・空」として
      // キャッシュされモーダルが無言で空表示になるため、throw して
      // TanStack Query の retry・エラー表示に委ねる。
      // throw すると Supabase の元エラーが失われ原因を追えなくなるため、
      // 事前に両方のエラーをログしておく
      if (costResult.error || businessResult.error) {
        console.error(
          "案件詳細の取得に失敗しました:",
          costResult.error,
          businessResult.error,
        );
        throw new Error("案件詳細の取得に失敗しました");
      }

      return {
        costs: (costResult.costInfoList ?? []).map((cost) => ({
          ...cost,
          isNew: false,
          isRemoved: false,
        })),
        businesses: (businessResult.businessInfoList ?? []).map((business) => ({
          ...business,
          isNew: false,
          isRemoved: false,
        })),
      };
    },
    enabled: enabled && !!matterId,
    staleTime: options?.staleTime ?? 1 * 60 * 1000, // 既定1分。閲覧専用は 0 を指定
    ...(options?.refetchOnMount !== undefined && {
      refetchOnMount: options.refetchOnMount,
    }),
  });
};

// 案件更新
export const useUpdateMatter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // コスト・取引先の isNew INSERT を含む非冪等更新のため、
    // グローバル retry: 1 による mutationFn 再実行を防ぐ
    retry: 0,
    mutationFn: (data: {
      matterInfo: MatterType;
      businessInfoList: BusinessInCardType[];
      costInfoList: CostInCardType[];
    }) => {
      const matterInfo = {
        ...data.matterInfo,
        start_date: normalizeMatterStartDate(data.matterInfo.start_date),
      };
      const validation = validateMatterPayload(
        matterInfo,
        data.businessInfoList,
        data.costInfoList,
        {
          skipRemoved: true,
          requireStartDate: matterInfo.is_fixed === true,
        },
      );
      if (!validation.ok) {
        throw new Error(
          getMatterValidationMessage(validation.reason, "update"),
        );
      }
      return updateMatter(matterInfo, data.businessInfoList, data.costInfoList);
    },
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
      notifyError(toErrorMessage(error, "案件の更新に失敗しました。"));
    },
  });
};

// 案件作成
export const useCreateMatter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // addMatterInfo は matter INSERT 後にコスト・取引先を入れる非冪等処理。
    // グローバル retry: 1 だと一時失敗で案件行が重複する
    retry: 0,
    mutationFn: (data: {
      matterInfo: MatterType;
      businessInfoList: BusinessInCardType[];
      costInfoList: CostInCardType[];
    }) =>
      addMatterInfo(data.matterInfo, data.businessInfoList, data.costInfoList),
    onSuccess: (created, variables) => {
      if (!created) return;
      queryClient.invalidateQueries({
        queryKey: ["matters"],
        refetchType: "all",
      });
      if (variables.matterInfo.is_fixed) {
        notifySuccess(
          `${variables.matterInfo.title}の経理申請を完了しました。`,
        );
      } else {
        notifySuccess(
          `${variables.matterInfo.title}の下書き作成を完了しました。\n経理申請まで忘れずご対応をお願い致します。`,
        );
      }
    },
    onError: (error) => {
      console.error("案件作成エラー:", error);
      notifyError(toErrorMessage(error, "案件作成に失敗しました。"));
    },
  });
};

// 案件削除
export const useDeleteMatter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matter: MatterType) => deleteMatter(matter),
    onSuccess: (deleted, deletedMatter) => {
      if (!deleted) return;
      queryClient.removeQueries({ queryKey: ["matter", deletedMatter.id] });
      queryClient.invalidateQueries({ queryKey: ["matters"] });
      notifySuccess(`案件[${deletedMatter.title}]を削除しました。`);
    },
    onError: (error, deletedMatter) => {
      console.error("案件削除エラー:", error);
      // 二重クリックや別タブでの先行削除では削除 0 行がエラーになるが、案件は
      // 実際には消えている。キャッシュを無効化して一覧・詳細を実状態に合わせる。
      queryClient.invalidateQueries({ queryKey: ["matter", deletedMatter.id] });
      queryClient.invalidateQueries({ queryKey: ["matters"] });
      notifyError(toErrorMessage(error, "案件削除に失敗しました。"));
    },
  });
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
          import("../utils/supabase/matters"),
        ]);

      // Server Action は同一クライアントからは直列実行される上、Slack 側の
      // レート制限（概ね1メッセージ/秒）もあるため、送信は明示的に直列で行い、
      // 失敗しても残りの案件の送信は継続する
      const notifiedMatterIds: number[] = [];
      const failedTitles: string[] = [];
      for (const matter of matters) {
        // slack_id が null の場合は sendMessageToSlack 側で
        // ユーザー名表示にフォールバックする
        const notified = await sendMessageToSlack(
          matter.slack_id ?? "",
          matter.user_name ?? "",
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
    mutationFn: async (targetMatterIds: number[]) => {
      const checkMatterInfoList = (
        await import("../utils/supabase/checkMatterInfoList")
      ).default;
      return checkMatterInfoList(targetMatterIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matters"] });
      notifySuccess("案件のチェック処理を完了しました。");
    },
    onError: (error) => {
      console.error("確認完了エラー:", error);
      notifyError(toErrorMessage(error, "確認完了に失敗しました。"));
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
      const { updateMatterInfo } = await import("../utils/supabase/matters");

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
      const { updateMatterInfo } = await import("../utils/supabase/matters");

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
