import { getAllMatterInfoList } from "@/app/utils/supabase/matters";
import type { MatterWithProfileType } from "@/app/hooks/useMatterData";
import { MatterList } from "../MatterList";

const DynamicAccouting = async () => {
  const matterListWithProfile = await getAllMatterInfoList();

  // TanStack Query のキャッシュをシードするため、profiles を含む生の形のまま渡す
  // （MatterInfoWithUserNameType への変換はクライアント側の useMemo で行う）
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
