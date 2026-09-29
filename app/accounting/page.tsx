import { redirect } from "next/navigation";

// Legacy URL: redirect kept for bookmark compatibility after matter cards moved to tabs (/matters/accounting).
const AccountingMatterPage = () => {
  redirect("/matters/accounting");
};

export default AccountingMatterPage;
