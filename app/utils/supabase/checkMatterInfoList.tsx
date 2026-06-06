import { notifications } from "@mantine/notifications";
import { updateMatterInfo } from "./supabaseServer";
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
  try {
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
      // user_name / slack_id は表示用の付加情報のため、更新対象から除外する
      const { user_name, slack_id, ...updatedMatter } = matterInfo;
      updatedMatter.is_completed = true;
      await updateMatterInfo(updatedMatter);
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
