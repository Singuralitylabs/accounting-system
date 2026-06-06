import { MatterInfoWithUserNameType, MatterType } from "@/app/types/types";
import { getAllMatterInfoList } from "@/app/utils/supabase/supabaseServer";
import { AccountingMatterList } from "../AccountingMatterList";

type MatterTypeAndProfileType = MatterType & {
  profiles: {
    name: string;
    slack_id: string | null;
  } | null;
};
const DynamicAccouting = async () => {
  const matterListWithProfile: MatterTypeAndProfileType[] | null =
    await getAllMatterInfoList();

  const matterList: MatterInfoWithUserNameType[] =
    matterListWithProfile?.map(
      (matterWithProfile: MatterTypeAndProfileType) => {
        const { profiles, ...matterInfo } = matterWithProfile;
        return {
          ...matterInfo,
          user_name: profiles!.name,
          slack_id: profiles!.slack_id,
        };
      },
    ) ?? [];

  return (
    <main>
      <AccountingMatterList initialData={matterList} />
    </main>
  );
};

export default DynamicAccouting;
