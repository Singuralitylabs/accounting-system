import { notifications } from "@mantine/notifications";
import { bulkCompleteMatterInfo } from "./matters";
import { MatterInfoWithUserNameType } from "@/app/types/types";

const checkMatterInfoList = async (
  matterInfoList: MatterInfoWithUserNameType[]
) => {
  if (matterInfoList.length === 0) {
    alert("完了にする案件にチェックを入れてください。");
    return;
  }
  const isCompleted = window.confirm(
    `${matterInfoList.length}件の案件を完了にしますか？`
  );
  if (!isCompleted) {
    alert("案件の完了処理を中止しました。");
    return;
  }

  // 完了対象を先に選別する（下書きはスキップ、未払いコストありは個別確認）
  const targetMatterIds: number[] = [];
  for (const matterInfo of matterInfoList) {
    if (!matterInfo.is_fixed) {
      alert(`${matterInfo.title}は下書きのため、完了できません。`);
      continue;
    }
    if (matterInfo.unchecked_cost_count > 0) {
      const hasUncheckedCost = window.confirm(
        `${matterInfo.title}には未払いコストがあります。完了してよろしいですか？`
      );
      if (!hasUncheckedCost) continue;
    }
    targetMatterIds.push(matterInfo.id);
  }

  if (targetMatterIds.length === 0) {
    alert("完了対象の案件がありませんでした。");
    return;
  }

  try {
    // 1件ずつの更新（件数分の往復）ではなく、一括UPDATE 1回で完了にする
    const { error } = await bulkCompleteMatterInfo(targetMatterIds);
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("案件の完了処理エラー:", error);
    notifications.show({
      title: "エラー",
      message: "案件の完了処理に失敗しました",
      color: "red",
    });
    throw error;
  }
  alert(`案件のチェック処理を完了しました。`);
};

export default checkMatterInfoList;
