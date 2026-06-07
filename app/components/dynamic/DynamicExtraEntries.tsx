import { getExtraEntryList } from "@/app/utils/supabase/extraEntries";
import {
  getAllUserInfo,
  getSelectOptions,
} from "@/app/utils/supabase/supabaseServer";
import ExtraEntryList from "../extraEntries/ExtraEntryList";

const DynamicExtraEntries = async () => {
  const [
    { extraEntryList },
    incomeCategoryResult,
    expenseCategoryResult,
    paymentMethodResult,
    teamResult,
    userList,
  ] = await Promise.all([
    getExtraEntryList(),
    getSelectOptions("extra_income_category"),
    getSelectOptions("extra_expense_category"),
    getSelectOptions("payment_method"),
    getSelectOptions("team"),
    getAllUserInfo(),
  ]);

  return (
    <main>
      <ExtraEntryList
        initialData={extraEntryList ?? []}
        incomeCategoryList={incomeCategoryResult.options.map(
          (option) => option.value,
        )}
        expenseCategoryList={expenseCategoryResult.options.map(
          (option) => option.value,
        )}
        paymentMethodList={paymentMethodResult.options.map(
          (option) => option.value,
        )}
        teamList={teamResult.options.map((option) => option.value)}
        memberList={userList.map((user) => ({
          value: String(user.id),
          label: user.name,
        }))}
      />
    </main>
  );
};

export default DynamicExtraEntries;
