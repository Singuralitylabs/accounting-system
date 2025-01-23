import { getSelectOptions } from "@/app/utils/supabaseServer";
import NewMatterForm from "../NewMatterForm";

const DynamicNew = async () => {
  const { options: teamList } = await getSelectOptions("team");
  const { options: categoryList } = await getSelectOptions("category");
  const { options: itemList } = await getSelectOptions("item");
  const { options: certificateList } = await getSelectOptions("certificate");

  return (
    <div className="bg-slate-50">
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

export default DynamicNew;
