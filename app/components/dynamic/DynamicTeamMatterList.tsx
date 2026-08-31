import { getTeamMatterInfoList } from "@/app/utils/supabase/matters";
import { MatterList } from "../MatterList";

const DynamicTeamMatterList = async () => {
  const matterList = await getTeamMatterInfoList();

  return (
    <main>
      <MatterList variant="readonly" matterList={matterList || []} />
    </main>
  );
};

export default DynamicTeamMatterList;
