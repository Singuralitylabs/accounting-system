import { Suspense } from "react";
import DynamicTeamMatterList from "../../components/dynamic/DynamicTeamMatterList";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { getProfileInfo } from "../../utils/supabase/profiles";

const TeamMatterPage = async () => {
  const { profileInfo } = await getProfileInfo();
  const teamName = profileInfo?.team || "";

  return (
    <main className="pt-6">
      {teamName ? (
        <h1 className="mb-2 px-8 text-sm font-normal text-gray-600">
          {teamName}
        </h1>
      ) : null}
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicTeamMatterList />
      </Suspense>
    </main>
  );
};

export default TeamMatterPage;
