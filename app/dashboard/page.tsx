import PageTitle from "../components/PageTitle";
import SelectOptionList from "../components/SelectOptionList";
import UserList from "../components/UserList";
import { getAllUserInfo, getSelectOptions } from "../utils/supabaseServer";

const DashboardPage = async () => {
  const userList = await getAllUserInfo();
  const { options: teamList, error } = await getSelectOptions("team");

  return (
    <main className="p-4">
      <PageTitle title="管理画面" />
      <UserList userList={userList} />
      <SelectOptionList optionTitle="チーム" optionList={teamList} />
    </main>
  );
};

export default DashboardPage;
