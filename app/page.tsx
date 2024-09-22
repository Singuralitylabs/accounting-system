import { MatterCardsGrid } from "./components/MatterCard";
import PageTitle from "./components/PageTitle";

const AllMatterPage = async () => {
  return (
    <div>
      <PageTitle title="案件一覧" />
      <MatterCardsGrid />
    </div>
  );
};

export default AllMatterPage;
