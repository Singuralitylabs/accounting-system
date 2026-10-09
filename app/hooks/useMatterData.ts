import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
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

export type MatterWithProfileType = MatterType & {
  profiles: {
    name: string;
    slack_id: string | null;
  } | null;
};

export const useUserMatterList = (initialData?: MatterType[]) => {
  return useQuery({
    queryKey: ["matters", "user"],
    queryFn: async () => {
      const result = await getUserMatterInfoList();
      // The helper returns null on error; convert to throw so retry and previous-data retention apply (as in useAllMatterList).
      if (result === null) {
        throw new Error("案件情報の取得に失敗しました");
      }
      return result;
    },
    initialData,
    staleTime: 2 * 60 * 1000,
  });
};

export const useAllMatterList = (
  initialData?: MatterWithProfileType[],
  filters: MatterListFilters = {},
) => {
  return useQuery({
    queryKey: ["matters", "all", filters],
    queryFn: async () => {
      const result = await getAllMatterInfoList(filters);
      // The helper returns null on error; convert to throw so the cache is not overwritten with null.
      if (result === null) {
        throw new Error("案件一覧の取得に失敗しました");
      }
      return result as MatterWithProfileType[];
    },
    initialData: hasMatterListFilters(filters) ? undefined : initialData,
    // A new filter key would otherwise drop the list until the fetch finishes (looks like zero rows).
    placeholderData: keepPreviousData,
    staleTime: 2 * 60 * 1000,
  });
};

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

      // Throw on fetch error instead of falling back to [] (cached as "success, empty"); log both errors first because throwing loses the original Supabase error.
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
    staleTime: options?.staleTime ?? 1 * 60 * 1000, // default 1 min; 0 for read-only
    ...(options?.refetchOnMount !== undefined && {
      refetchOnMount: options.refetchOnMount,
    }),
  });
};

export const useUpdateMatter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Non-idempotent update (isNew INSERTs): prevent automatic re-run explicitly, independent of QueryProvider defaults.
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
      queryClient.invalidateQueries({
        queryKey: ["matter", variables.matterInfo.id],
      });
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("案件更新エラー:", error);
      notifyError(toErrorMessage(error, "案件の更新に失敗しました。"));
    },
  });
};

export const useCreateMatter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Non-idempotent (matter INSERT then costs/businesses); re-running would duplicate the matter row.
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
      // Zero-row deletes error on double click or delete in another tab; invalidate to resync.
      queryClient.invalidateQueries({ queryKey: ["matter", deletedMatter.id] });
      queryClient.invalidateQueries({ queryKey: ["matters"] });
      notifyError(toErrorMessage(error, "案件削除に失敗しました。"));
    },
  });
};

export type SlackNotificationResult = {
  failedTitles: string[];
  // Matters not attempted because sending was aborted (they stay un-notified and can be resent).
  unsentMatterIds: number[];
  abortReason?: string;
  dbUpdateFailed: boolean;
};

export const useSlackNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Slack sends are non-idempotent side effects; auto re-run would double-notify.
    retry: 0,
    mutationFn: async (data: {
      matters: MatterInfoWithUserNameType[];
      message: string;
    }): Promise<SlackNotificationResult> => {
      const { matters, message } = data;

      const [{ default: sendMessageToSlack }, { bulkUnfixMatterInfo }] =
        await Promise.all([
          import("../utils/slack/sendMessageToSlack"),
          import("../utils/supabase/matters"),
        ]);

      // Send sequentially (Server Actions run serially per client; Slack rate limit is about 1 msg/s); continue after per-matter failures, but stop on an "aborted" one (e.g. no permission) since every remaining send would fail the same way.
      const notifiedMatterIds: number[] = [];
      const failedTitles: string[] = [];
      const unsentMatterIds: number[] = [];
      let abortReason: string | undefined;
      for (let index = 0; index < matters.length; index++) {
        const matter = matters[index];
        const result = await sendMessageToSlack(
          matter.slack_id ?? "",
          matter.user_name ?? "",
          matter.title,
          message,
        );
        if (result.status === "sent") {
          notifiedMatterIds.push(matter.id);
        } else if (result.status === "failed") {
          failedTitles.push(matter.title);
        } else {
          abortReason = result.reason;
          unsentMatterIds.push(...matters.slice(index).map((m) => m.id));
          break;
        }
      }

      // Revert only notified matters. Return partial failures instead of throwing, otherwise the cache is not invalidated and the UI diverges from the DB.
      let dbUpdateFailed = false;
      if (notifiedMatterIds.length > 0) {
        const { error } = await bulkUnfixMatterInfo(notifiedMatterIds);
        if (error) {
          console.error("案件の一括差し戻しに失敗しました:", error);
          dbUpdateFailed = true;
        }
      }

      return { failedTitles, unsentMatterIds, abortReason, dbUpdateFailed };
    },
    onSettled: () => {
      // Invalidate regardless of outcome: the DB may be updated even on partial failure.
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("Slack通知エラー:", error);
    },
  });
};

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
        is_completed: true,
        has_updates: data.clearHasUpdates ? false : data.matterInfo.has_updates,
        user_id: data.matterInfo.user_id,
        accounting_memo: data.accountingMemo || data.matterInfo.accounting_memo,
        inserted_at: data.matterInfo.inserted_at,
        updated_at: data.matterInfo.updated_at,
      };

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

      await updateMatter(matterToUpdate, businessInCardList, costInCardList);

      return true;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["matter", variables.matterInfo.id],
      });
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("確認完了エラー:", error);
    },
  });
};

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
        is_completed: data.matterInfo.is_completed,
        has_updates: data.clearHasUpdates ? false : data.matterInfo.has_updates,
        user_id: data.matterInfo.user_id,
        accounting_memo: data.accountingMemo || data.matterInfo.accounting_memo,
        inserted_at: data.matterInfo.inserted_at,
        updated_at: data.matterInfo.updated_at,
      };

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

      await updateMatter(matterToUpdate, businessInCardList, costInCardList);

      return true;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["matter", variables.matterInfo.id],
      });
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("保存エラー:", error);
    },
  });
};

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
        is_fixed: true,
        is_completed: false,
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
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("申請中に戻すエラー:", error);
    },
  });
};

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
        is_fixed: false,
        is_completed: false,
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
      queryClient.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (error) => {
      console.error("下書きに戻すエラー:", error);
    },
  });
};
