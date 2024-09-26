import { categoryList, teamList } from "@/app/types/params";
import { MatterType } from "@/app/types/types";
import {
  deleteMatterInfoInSupabase,
  updateMatterInfoInSupabase,
} from "@/app/utils/supabaseServer";
import {
  Modal,
  TextInput,
  Checkbox,
  NumberInput,
  Select,
  Button,
  Group,
} from "@mantine/core";
import { useForm } from "@mantine/form";

type Props = {
  matterInfo: MatterType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

type UpdatedMatterInfo = {
  id: number;
  name: string;
  team: string;
  category: string;
  amount: number | null;
  is_fixed: boolean | null;
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
      team: matterInfo.team,
      category: matterInfo.category,
      amount: matterInfo.amount,
      is_fixed: matterInfo.is_fixed,
    },
  });

  const closeModal = () => {
    setOpened(false);
    form.reset();
  };

  const handleUpdateMatterInfo = async (
    updatedMatterInfo: UpdatedMatterInfo
  ) => {
    matterInfo.name = updatedMatterInfo.name;
    matterInfo.category = updatedMatterInfo.category;
    matterInfo.team = updatedMatterInfo.team;
    matterInfo.amount = updatedMatterInfo.amount;
    matterInfo.is_fixed = updatedMatterInfo.is_fixed;
    await updateMatterInfoInSupabase(matterInfo);
    closeModal();
  };

  const handleDeleteMatterInfo = async () => {
    await deleteMatterInfoInSupabase(matterInfo.id);
    closeModal();
  };

  return (
    <Modal opened={opened} onClose={closeModal} title={matterInfo.name}>
      <form
        onSubmit={form.onSubmit((updatedMatterInfo) => {
          handleUpdateMatterInfo(updatedMatterInfo);
        })}
      >
        <TextInput
          withAsterisk
          label="案件名"
          placeholder="案件名をご記入ください。"
          {...form.getInputProps("name")}
        />
        <Select
          label="分類"
          placeholder="案件の分類をご記入ください。"
          data={categoryList}
          required
          {...form.getInputProps("category")}
        />
        <Select
          label="チーム"
          placeholder="案件を担当するチームを選択ください。"
          data={teamList}
          required
          {...form.getInputProps("team")}
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
        <div className="flex justify-between">
          <Group justify="flex-end" mt="md">
            <Button type="button" color="gray" onClick={handleDeleteMatterInfo}>
              削除
            </Button>
          </Group>
          <Group justify="flex-end" mt="md">
            <Button type="button" color="pink" onClick={closeModal}>
              キャンセル
            </Button>
            <Button type="submit" color="green">
              更新
            </Button>
          </Group>
        </div>
      </form>
    </Modal>
  );
};
