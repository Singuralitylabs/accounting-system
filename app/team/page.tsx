import React from "react";
import { getTeamMatterInfoList } from "../utils/supabase/supabaseServer";
import TeamMatterList from "../components/team/TeamMatterList";

const Team = async () => {
  const matterList = await getTeamMatterInfoList();

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">チーム案件一覧</h1>
      <TeamMatterList matterList={matterList || []} />
    </div>
  );
};

export default Team;
