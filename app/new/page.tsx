import NewMatterForm from "../components/NewMatterForm";
import PageTitle from "../components/PageTitle";
import { getSelectOptions } from "../utils/supabaseServer";

export const dynamic = "force-dynamic";

const NewMatterPage = async () => {
  const { options: teamList } = await getSelectOptions("team");
  const { options: categoryList } = await getSelectOptions("category");
  const { options: itemList } = await getSelectOptions("item");
  const { options: certificateList } = await getSelectOptions("certificate");

  return (
    <div className="bg-slate-50">
      <PageTitle title="新規案件の作成" />
      <NewMatterForm
        teamList={teamList.map((team) => team.value)}
        categoryList={categoryList.map((category) => category.value)}
        itemList={itemList.map((item) => item.value)}
        certificateList={certificateList.map(
          (certificate) => certificate.value
        )}
      />
    </div>
  );
};

export default NewMatterPage;
