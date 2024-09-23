import { MatterCardsGrid } from "./components/MatterCard";
import PageTitle from "./components/PageTitle";
import { createServerComponentClient } from "@/node_modules/@supabase/auth-helpers-nextjs/dist/index";
import { cookies } from "@/node_modules/next/headers";

const UsersMatterPage = async () => {
  const supabase = createServerComponentClient({ cookies });
  const { data: matterList } = await supabase.from("matters").select("*");

  return (
    <main className="">
      <PageTitle title="案件一覧" />
      <MatterCardsGrid matterList={matterList} />
    </main>
  );
};

export default UsersMatterPage;
