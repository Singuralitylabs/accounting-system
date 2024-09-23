import { MatterType } from "@/app/types/types";
import { Modal, TextInput, Checkbox, NumberInput } from "@mantine/core";
import { useForm } from "@mantine/form";

type Props = {
  matterInfo: MatterType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

export const MatterCardDetailModal = ({
  matterInfo,
  opened,
  setOpened,
}: Props) => {
  const form = useForm({
    initialValues: {
      id: matterInfo.id,
      name: matterInfo.name,
      inserted_at: matterInfo.inserted_at,
      team: matterInfo.team,
      category: matterInfo.category,
      is_completed: matterInfo.is_completed,
      amount: matterInfo.amount,
      is_fixed: matterInfo.is_fixed,
      user_id: matterInfo.user_id,
    },
  });

  const closeModal = () => {
    setOpened(false);
    form.reset();
  };

  return (
    <Modal opened={opened} onClose={closeModal} title={matterInfo.name}>
      <form>
        <TextInput
          withAsterisk
          label="案件名"
          placeholder="案件名をご記入ください。"
          {...form.getInputProps("name")}
        />
        <TextInput
          label="分類"
          placeholder="案件の分類をご記入ください。"
          {...form.getInputProps("category")}
        />
        <NumberInput
          label="金額"
          placeholder="金額をご記入ください。"
          min={0}
          prefix="¥"
          allowNegative={false}
          allowDecimal={false}
          thousandSeparator=","
          {...form.getInputProps("amount")}
        />

        <Checkbox
          mt="md"
          label="確定"
          {...form.getInputProps("isFixed", { type: "checkbox" })}
        />
        <div className="border-spacing-3 h-6"></div>
      </form>
    </Modal>
  );
};
