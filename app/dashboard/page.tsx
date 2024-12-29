import PageTitle from "../components/PageTitle";
import UserList from "../components/UserList";
import { getAllUserInfo } from "../utils/supabaseServer";

const DashboardPage = async () => {
  const userList = await getAllUserInfo();

  return (
    <main>
      <PageTitle title="管理画面" />
      <UserList userList={userList} />
    </main>
  );
};

export default DashboardPage;
