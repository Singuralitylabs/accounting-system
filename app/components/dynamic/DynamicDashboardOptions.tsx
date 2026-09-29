import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import { Title } from "@mantine/core";
import SelectOptionList from "../SelectOptionList";

// Option kinds (display order) and names for fetch-failure messages (match the SelectOptionList card headings).
const OPTION_CLASSES = [
  { optionClass: "team", label: "チーム" },
  { optionClass: "category", label: "分類" },
  { optionClass: "item", label: "品目" },
  { optionClass: "extra_income_category", label: "収入分類" },
  { optionClass: "extra_expense_category", label: "支出分類" },
  { optionClass: "payment_method", label: "決済方法" },
] as const;

const DynamicDashboardOptions = async () => {
  // The six kinds are fetched in parallel (collapsed into one query by React.cache).
  const results = await Promise.all(
    OPTION_CLASSES.map(({ optionClass }) => getSelectOptions(optionClass)),
  );
  // A failed fetch shows an error inside its card instead of failing the whole page.
  OPTION_CLASSES.forEach(({ label }, index) => {
    const { error } = results[index];
    if (error) {
      console.error(`${label}情報の取得に失敗しました。`, error);
    }
  });

  return (
    <div className="p-4">
      <Title order={2} className="pb-4">
        項目管理
      </Title>
      <div className="md:grid md:grid-cols-3 md:gap-8">
        {OPTION_CLASSES.map(({ optionClass, label }, index) => {
          const { options, error } = results[index];
          return (
            <div key={optionClass} className="pb-4">
              {!error ? (
                <SelectOptionList
                  optionClass={optionClass}
                  optionList={options}
                />
              ) : (
                <div className="rounded border border-gray-500 bg-slate-50 p-4 text-red-600">
                  {label}情報の取得に失敗しました。
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DynamicDashboardOptions;
