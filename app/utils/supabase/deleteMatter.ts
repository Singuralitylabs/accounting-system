import { MatterType } from "../../types/types";
import { NO_ROWS_DELETED } from "./errorCodes";
import { deleteMatterInfo } from "./matters";

// costs / business matter_id are ON DELETE CASCADE, so deleting the matter removes lines atomically.
// Do not delete lines first: if only that succeeds, the matter would remain without its lines.
const deleteMatter = async (matter: MatterType) => {
  const { error: matterError } = await deleteMatterInfo(matter.id);
  if (matterError) {
    console.error("Error deleting matter:", matterError);
    // 0 rows deleted (RLS-blocked / already deleted) gets a different message from a DB failure.
    if (matterError.code === NO_ROWS_DELETED) {
      throw new Error(
        "案件が見つかりませんでした。既に削除されているか、削除する権限がありません。",
      );
    }
    throw new Error("案件情報の削除に失敗しました。");
  }
  return true;
};

export default deleteMatter;
