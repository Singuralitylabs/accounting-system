import React from "react";
import { getTeamMatterInfoList } from "../utils/supabase/matters";
import { getProfileInfo } from "../utils/supabase/profiles";
import TeamMatterList from "../components/team/TeamMatterList";

const Team = async () => {
  const matterList = await getTeamMatterInfoList();
  const { profileInfo } = await getProfileInfo();

  const teamName = profileInfo?.team || "";

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{teamName}チーム案件一覧</h1>
      <TeamMatterList matterList={matterList || []} />
    </div>
  );
};

export default Team;
