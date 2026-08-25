import { bulkCompleteMatterInfo } from "./matters";

const checkMatterInfoList = async (targetMatterIds: number[]) => {
  if (targetMatterIds.length === 0) {
    throw new Error("完了対象の案件がありませんでした。");
  }

  const { error } = await bulkCompleteMatterInfo(targetMatterIds);
  if (error) {
    console.error("案件の完了処理エラー:", error);
    throw new Error("案件の完了処理に失敗しました");
  }

  return { completedCount: targetMatterIds.length };
};

export default checkMatterInfoList;
