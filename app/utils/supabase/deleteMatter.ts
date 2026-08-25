import { MatterType } from "../../types/types";
import { deleteBusinessInfo, getUserBusinessInfoList } from "./businesses";
import { deleteCostInfo, getUserCostInfoList } from "./costs";
import { deleteMatterInfo } from "./matters";

const deleteMatter = async (matter: MatterType) => {
  const { costInfoList, error: costError } = await getUserCostInfoList(
    matter.id,
  );
  if (costError) {
    console.error("Error fetching costInfoList:", costError);
    throw new Error("コスト情報の取得に失敗しました。");
  }

  const { businessInfoList, error: businessError } =
    await getUserBusinessInfoList(matter.id);
  if (businessError) {
    console.error("Error fetching businessInfoList:", businessError);
    throw new Error("取引先情報の取得に失敗しました。");
  }

  if (costInfoList) {
    for (const costInfo of costInfoList) {
      await deleteCostInfo(costInfo.id);
    }
  }

  if (businessInfoList) {
    for (const businessInfo of businessInfoList) {
      await deleteBusinessInfo(businessInfo.id);
    }
  }
  await deleteMatterInfo(matter.id);
  return true;
};

export default deleteMatter;
