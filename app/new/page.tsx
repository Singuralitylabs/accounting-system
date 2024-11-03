import NewMatterForm from "../components/newMatterForm";
import PageTitle from "../components/PageTitle";

export const dynamic = "force-dynamic";

const NewMatterPage = async () => {
  return (
    <div className="bg-slate-50">
      <PageTitle title="新規案件の作成" />
      <NewMatterForm />
    </div>
  );
};

export default NewMatterPage;
