import { Select, TextInput, Textarea } from "@mantine/core";
import { CustomDatePicker } from "./CustomDatePicker";
import { categoryList, teamList } from "@/app/types/params";
import { UseFormReturnType } from "@mantine/form";

export type MatterFormValues = {
  id: number;
  title: string;
  team: string;
  category: string;
  start_date: string | null;
  total_amount: number | null;
  business_count: number | null;
  total_cost: number | null;
  cost_count: number | null;
  is_fixed: boolean | null;
  description: string | null;
  user_id: number;
  inserted_at: string;
  updated_at: string;
  is_completed: boolean | null;
  accounting_memo: string | null;
};

type Props = {
  form: UseFormReturnType<MatterFormValues>;
  bgColor?: string;
  isFixedMode?: boolean;
};

export const MatterInfoBlock = ({
  form,
  bgColor = "bg-white",
  isFixedMode = false,
}: Props) => {
  return (
    <div className={`p-4 rounded-lg ${bgColor}`}>
      <div className="md:flex gap-4 w-full">
        <TextInput
          className="w-full"
          withAsterisk
          required
          placeholder="案件名をご記入ください。"
          label="案件名"
          disabled={isFixedMode}
          key={form.key("title")}
          {...form.getInputProps("title")}
        />
        <Select
          withAsterisk
          required
          className="md:pt-0 pt-4 w-full"
          placeholder="案件に適した分類を選択して下さい。"
          label="分類"
          data={categoryList}
          clearable
          disabled={isFixedMode}
          key={form.key("category")}
          {...form.getInputProps("category")}
        />
        <Select
          withAsterisk
          required
          className="md:pt-0 pt-4 w-full"
          placeholder="案件担当のチームを選択して下さい。"
          label="チーム"
          data={teamList}
          clearable
          disabled={isFixedMode}
          key={form.key("team")}
          {...form.getInputProps("team")}
        />
        <CustomDatePicker
          label="案件開始日"
          required
          placeholder="案件開始日をご記入ください。"
          className="md:pt-0 pt-4 w-full"
          disabled={isFixedMode}
          showIcon
          key={form.key("start_date")}
          {...form.getInputProps("start_date")}
          value={form.getValues().start_date}
          onChange={(date) => form.setFieldValue("start_date", date || "")}
        />
      </div>

      <Textarea
        className="pt-4 w-full"
        placeholder="案件に関して追加で説明があればご記入ください。"
        label="説明"
        disabled={isFixedMode}
        key={form.key("description")}
        {...form.getInputProps("description")}
      />
    </div>
  );
};

export default MatterInfoBlock;
