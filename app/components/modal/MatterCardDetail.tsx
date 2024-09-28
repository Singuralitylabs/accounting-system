import { categoryList, itemList, teamList } from "@/app/types/params";
import { CostType, MatterType } from "@/app/types/types";
import {
  deleteMatterInfoInSupabase,
  getUserCostInfoList,
  updateMatterInfoInSupabase,
} from "@/app/utils/supabaseServer";
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
import { useEffect, useState } from "react";

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
  const [costInfoList, setCostInfoList] = useState<CostType[]>([]);
  useEffect(() => {
    if (opened) {
      const getCostInfo = async () => {
        const { costInfoList, error } = await getUserCostInfoList(
          matterInfo.id
        );

        if (error) {
          console.error("Error fetching costInfoList:", error);
          return <div>コスト情報の取得に失敗しました。</div>;
        } else if (costInfoList) {
          setCostInfoList(costInfoList);
        }
      };
      getCostInfo();
    }
  }, [opened]);

  const form = useForm({
    initialValues: {
      id: matterInfo.id,
      name: matterInfo.name,
      team: matterInfo.team,
      category: matterInfo.category,
      amount: matterInfo.amount,
      is_fixed: matterInfo.is_fixed,
      costInfoList: costInfoList as CostType[],
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
        {costInfoList.length > 0 ? <h2 className="my-4">コスト情報</h2> : ""}
        {costInfoList?.map((cost) => (
          <div className="flex items-center pb-2" key={cost.id}>
            <Group gap="sm" className="flex-grow" grow>
              <TextInput
                placeholder="品名をご記入ください。"
                className="flex-grow"
                value={cost.name as string}
                onChange={(event) =>
                  setCostInfoList(
                    costInfoList.map((costInfo) =>
                      costInfo.id === cost.id
                        ? { ...costInfo, name: event.target.value }
                        : costInfo
                    )
                  )
                }
              />
              <Select
                className="flex-grow"
                placeholder="品目を選択ください。"
                data={itemList}
                required
                value={cost.item}
                onChange={(value) =>
                  setCostInfoList(
                    costInfoList.map((costInfo) =>
                      costInfo.id === cost.id
                        ? { ...costInfo, item: value || "" }
                        : costInfo
                    )
                  )
                }
              />
              <NumberInput
                placeholder="¥0"
                className="flex-grow"
                value={cost.amount as number}
                prefix="¥"
                allowNegative={false}
                allowDecimal={false}
                thousandSeparator=","
                onChange={(value) =>
                  setCostInfoList(
                    costInfoList.map((costInfo) =>
                      costInfo.id === cost.id
                        ? { ...costInfo, price: Number(value) }
                        : costInfo
                    )
                  )
                }
              />
            </Group>
          </div>
        ))}
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
