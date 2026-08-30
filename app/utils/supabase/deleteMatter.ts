import { MatterType } from "../../types/types";
import { deleteMatterInfo } from "./matters";

// costs.matter_id / business.matter_id はいずれも ON DELETE CASCADE のため、
// 案件本体を削除すれば明細も同一トランザクション内で原子的に削除される。
// 明細を先行削除すると、片方だけ成功して案件本体が残った場合に
// 明細だけが失われるため、先行削除は行わない。
const deleteMatter = async (matter: MatterType) => {
  const { error: matterError } = await deleteMatterInfo(matter.id);
  if (matterError) {
    console.error("Error deleting matter:", matterError);
    throw new Error("案件情報の削除に失敗しました。");
  }
  return true;
};

export default deleteMatter;
