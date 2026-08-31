import { redirect } from "next/navigation";

// 旧 URL。案件カードのタブ化（/matters/accounting）に伴うブックマーク互換のリダイレクト。
const AccountingMatterPage = () => {
  redirect("/matters/accounting");
};

export default AccountingMatterPage;
