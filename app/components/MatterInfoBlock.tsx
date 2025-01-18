import { Select, TextInput, Textarea } from "@mantine/core";
import { CustomDatePicker } from "./CustomDatePicker";
import { UseFormReturnType } from "@mantine/form";
import { MatterType } from "../types/types";

type Props = {
  form: UseFormReturnType<MatterType>;
  teamList: string[];
  categoryList: string[];
  bgColor?: string;
  isFixedMode?: boolean;
};

export const MatterInfoBlock = ({
  form,
  teamList,
  categoryList,
  bgColor = "bg-white",
  isFixedMode = false,
}: Props) => {
  if (!teamList.includes(form.getValues().team) && isFixedMode)
    teamList.push(form.getValues().team);
  if (!categoryList.includes(form.getValues().category) && isFixedMode)
    categoryList.push(form.getValues().category);

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
