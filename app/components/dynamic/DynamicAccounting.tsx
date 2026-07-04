import { getAllMatterInfoList } from "@/app/utils/supabase/supabaseServer";
import { MatterWithProfileType } from "@/app/hooks/useMatterData";
import { AccountingMatterList } from "../AccountingMatterList";

const DynamicAccouting = async () => {
  const matterListWithProfile = await getAllMatterInfoList();

  // TanStack Query のキャッシュをシードするため、profiles を含む生の形のまま渡す
  // （MatterInfoWithUserNameType への変換はクライアント側の useMemo で行う）
  return (
    <main>
      <AccountingMatterList
        initialData={
          (matterListWithProfile as MatterWithProfileType[] | null) ?? undefined
        }
      />
    </main>
  );
};

export default DynamicAccouting;
