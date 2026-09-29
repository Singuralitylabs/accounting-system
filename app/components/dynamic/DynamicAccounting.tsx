import { getAllMatterInfoList } from "@/app/utils/supabase/matters";
import type { MatterWithProfileType } from "@/app/hooks/useMatterData";
import { MatterList } from "../MatterList";

const DynamicAccouting = async () => {
  const matterListWithProfile = await getAllMatterInfoList();

  // Passed in raw form (with profiles) to seed the TanStack Query cache; conversion to MatterInfoWithUserNameType happens client-side in useMemo.
  return (
    <main>
      <MatterList
        variant="accounting"
        initialData={
          (matterListWithProfile as MatterWithProfileType[] | null) ?? undefined
        }
      />
    </main>
  );
};

export default DynamicAccouting;
