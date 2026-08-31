import { Suspense } from "react";
import PageTitle from "../../components/PageTitle";
import DynamicTeamMatterList from "../../components/dynamic/DynamicTeamMatterList";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { getProfileInfo } from "../../utils/supabase/profiles";

const TeamMatterPage = async () => {
  const { profileInfo } = await getProfileInfo();
  const teamName = profileInfo?.team || "";

  return (
    <main>
      <PageTitle title={`${teamName}チーム案件一覧`} />
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicTeamMatterList />
      </Suspense>
    </main>
  );
};

export default TeamMatterPage;
