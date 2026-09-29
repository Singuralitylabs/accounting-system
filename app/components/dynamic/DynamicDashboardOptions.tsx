import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import { OPTION_CLASSES } from "../../utils/selectOptionClasses";
import OptionsManager from "../dashboard/OptionsManager";

const DynamicDashboardOptions = async () => {
  // The six kinds are fetched in parallel (collapsed into one query by React.cache).
  const results = await Promise.all(
    OPTION_CLASSES.map(({ optionClass }) => getSelectOptions(optionClass)),
  );
  // A failed fetch shows an error in its panel instead of failing the whole page.
  const categories = OPTION_CLASSES.map(({ optionClass, label }, index) => {
    const { options, error } = results[index];
    if (error) {
      console.error(`${label}情報の取得に失敗しました。`, error);
    }
    return { optionClass, options, hasError: !!error };
  });

  return <OptionsManager categories={categories} />;
};

export default DynamicDashboardOptions;
