import PageTitle from "../components/PageTitle";
import { AccountingMatterList } from "../components/AccountingMatterList";
import { getAllMatterInfoList } from "../utils/supabaseServer";
import {
  MatterInfoWithUserNameType,
  MatterType,
  ProfilesType,
} from "../types/types";

export const dynamic = "force-dynamic";

type MatterTypeAndProfileType = MatterType & {
  profiles: ProfilesType;
};
const AccountingMatterPage = async () => {
  const matterListWithProfile: MatterTypeAndProfileType[] | null =
    await getAllMatterInfoList();

  const matterList: MatterInfoWithUserNameType[] =
    matterListWithProfile?.map(
      (matterWithProfile: MatterTypeAndProfileType) => {
        const { profiles, ...matterInfo } = matterWithProfile;
        return {
          ...matterInfo,
          user_name: profiles.name,
          slack_id: profiles.slack_id,
        };
      }
    ) ?? [];

  return (
    <main>
      <PageTitle title="経理用 案件一覧" />
      <AccountingMatterList matterList={matterList} />
    </main>
  );
};

export default AccountingMatterPage;
