import { bulkCompleteMatterInfo } from "./matters";
import { MatterInfoWithUserNameType } from "@/app/types/types";

const checkMatterInfoList = async (
  matterInfoList: MatterInfoWithUserNameType[],
) => {
  if (matterInfoList.length === 0) {
    throw new Error("完了にする案件にチェックを入れてください。");
  }
  const isCompleted = window.confirm(
    `${matterInfoList.length}件の案件を完了にしますか？`,
  );
  if (!isCompleted) {
    return { cancelled: true as const };
  }

  // 完了対象を先に選別する（下書きはスキップ、未払いコストありは個別確認）
  const targetMatterIds: number[] = [];
  const skippedDraftTitles: string[] = [];
  for (const matterInfo of matterInfoList) {
    if (!matterInfo.is_fixed) {
      skippedDraftTitles.push(matterInfo.title);
      continue;
    }
    if (matterInfo.unchecked_cost_count > 0) {
      const hasUncheckedCost = window.confirm(
        `${matterInfo.title}には未払いコストがあります。完了してよろしいですか？`,
      );
      if (!hasUncheckedCost) continue;
    }
    targetMatterIds.push(matterInfo.id);
  }

  if (targetMatterIds.length === 0) {
    throw new Error(
      skippedDraftTitles.length > 0
        ? `下書きのため完了できません: ${skippedDraftTitles.join("、")}`
        : "完了対象の案件がありませんでした。",
    );
  }

  const { error } = await bulkCompleteMatterInfo(targetMatterIds);
  if (error) {
    console.error("案件の完了処理エラー:", error);
    throw new Error("案件の完了処理に失敗しました");
  }

  return {
    cancelled: false as const,
    completedCount: targetMatterIds.length,
    skippedDraftTitles,
  };
};

export default checkMatterInfoList;
