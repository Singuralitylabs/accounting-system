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
  // 初期の対象月: `?month=YYYY-MM` が有効ならその月、無効・未指定なら当月（JST）。
  // 損益計算書の「経理追加収支を管理」ボタンは表示中の対象月を `?month=` に付けて遷移する
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

  // 取得に失敗した結果を空配列として描画すると「0 件」と区別が付かず、
  // TanStack Query の initialData にも成功結果としてキャッシュされてしまう。
  // 失敗時は throw してルートの error boundary（app/extra-entries/error.tsx）に処理させる。
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

  // サジェスト候補は補助的な表示のため、取得に失敗しても空配列で描画する
  // （クライアント側で再取得される）
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
        // シード時刻を渡さないと、TanStack Query が「今取得した」と扱い、
        // GC 後に古い initialData を再取得なしで表示してしまう
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
