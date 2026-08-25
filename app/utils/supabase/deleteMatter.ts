import { MatterType } from "../../types/types";
import { deleteBusinessesByMatterId } from "./businesses";
import { deleteCostsByMatterId } from "./costs";
import { deleteMatterInfo } from "./matters";

const deleteMatter = async (matter: MatterType) => {
  const confirm = window.confirm(
    "本当に削除しますか？\nこの操作は取り消せません。"
  );
  if (confirm) {
    const [{ error: costError }, { error: businessError }] = await Promise.all([
      deleteCostsByMatterId(matter.id),
      deleteBusinessesByMatterId(matter.id),
    ]);
    if (costError) {
      console.error("Error deleting costInfoList:", costError);
      throw new Error("コスト情報の削除に失敗しました。");
    }
    if (businessError) {
      console.error("Error deleting businessInfoList:", businessError);
      throw new Error("取引先情報の削除に失敗しました。");
    }

    const { error: matterError } = await deleteMatterInfo(matter.id);
    if (matterError) {
      console.error("Error deleting matter:", matterError);
      throw new Error("案件情報の削除に失敗しました。");
    }
    return true;
  }
  return false;
};

export default deleteMatter;
