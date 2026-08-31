import { redirect } from "next/navigation";

// 旧 URL。案件カードのタブ化（/matters/team）に伴うブックマーク互換のリダイレクト。
const Team = () => {
  redirect("/matters/team");
};

export default Team;
