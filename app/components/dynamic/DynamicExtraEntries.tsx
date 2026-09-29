import {
  getExtraEntryList,
  getExtraEntrySuggestions,
} from "@/app/utils/supabase/extraEntries";
import { getAllUserInfo } from "@/app/utils/supabase/profiles";
import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import { resolveExtraEntryMonth } from "@/app/utils/extraEntry";
import ExtraEntryList from "../extraEntries/ExtraEntryList";

type Props = {
  monthParam?: string;
};

const DynamicExtraEntries = async ({ monthParam }: Props = {}) => {
  // Initial month: `?month=YYYY-MM` if valid, else the current month (JST); the statement's manage link passes the displayed month.
  const initialMonth = resolveExtraEntryMonth(monthParam);
  const [
    { extraEntryList, error: extraEntryError },
    incomeCategoryResult,
    expenseCategoryResult,
    paymentMethodResult,
    teamResult,
    { userInfoList, error: userInfoError },
    { suggestionList, error: suggestionError },
  ] = await Promise.all([
    getExtraEntryList(initialMonth),
    getSelectOptions("extra_income_category"),
    getSelectOptions("extra_expense_category"),
    getSelectOptions("payment_method"),
    getSelectOptions("team"),
    getAllUserInfo(),
    getExtraEntrySuggestions(),
  ]);

  // A failed result rendered as an empty array is indistinguishable from 0 rows and cached as success in initialData; throw to the route error boundary (app/extra-entries/error.tsx).
  if (extraEntryError || !extraEntryList) {
    throw new Error("経理追加収支情報の取得に失敗しました。");
  }

  const optionsError =
    incomeCategoryResult.error ??
    expenseCategoryResult.error ??
    paymentMethodResult.error ??
    teamResult.error;
  if (optionsError) {
    throw new Error("選択肢情報の取得に失敗しました。");
  }

  if (userInfoError || !userInfoList) {
    throw new Error("ユーザー情報の取得に失敗しました。");
  }

  // Suggestions are auxiliary: render with an empty array on failure (the client refetches).
  if (suggestionError) {
    console.error(
      "経理追加収支のサジェスト候補の取得に失敗しました:",
      suggestionError,
    );
  }

  return (
    <main>
      <ExtraEntryList
        initialMonth={initialMonth}
        initialData={extraEntryList}
        // Without the seed time TanStack Query treats initialData as fetched now and shows stale data after GC without refetching.
        initialDataUpdatedAt={Date.now()}
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
        initialSuggestions={suggestionList ?? []}
        memberList={userInfoList.map((user) => ({
          value: String(user.id),
          label: user.name,
        }))}
      />
    </main>
  );
};

export default DynamicExtraEntries;
