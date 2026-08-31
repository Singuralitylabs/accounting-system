import { getTeamMatterInfoList } from "@/app/utils/supabase/matters";
import { MatterList } from "../MatterList";

const DynamicTeamMatterList = async () => {
  const matterList = await getTeamMatterInfoList();

  return <MatterList variant="readonly" matterList={matterList || []} />;
};

export default DynamicTeamMatterList;
