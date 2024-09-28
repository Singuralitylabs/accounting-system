import { categoryList, itemList, teamList } from "@/app/types/params";
import { CostType, MatterType } from "@/app/types/types";
import {
  deleteMatterInfoInSupabase,
  getUserCostInfoList,
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
import { FaRegTrashAlt } from "react-icons/fa";
import { CiSquarePlus } from "react-icons/ci";

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

type CostInCardType = {
  id: number;
  name: string;
  item: string;
  payment_target: string;
  amount: number;
  period: string | null;
  certificate: string;
  withholding: boolean;
  matter_id: number;
  comment: string | null;
  isNew: boolean;
  isRemoved: boolean;
};

export const MatterCardDetailModal = ({
  matterInfo,
  opened,
  setOpened,
}: Props) => {
  const [costInfoIndex, setCostInfoIndex] = useState<number>(10000);
  const [costInfoInCardList, setCostInfoInCardList] = useState<
    CostInCardType[]
  >([]);
  useEffect(() => {
    if (opened) {
      const getCostInfo = async () => {
        const { costInfoList, error } = await getUserCostInfoList(
          matterInfo.id
        );

        if (error) {
          console.error("Error fetching costInfoList:", error);
          return <div>コスト情報の取得に失敗しました。</div>;
        }
        if (costInfoList) {
          setCostInfoInCardList(
            costInfoList.map((costInfo) => ({
              id: costInfo.id,
              name: costInfo.name,
              item: costInfo.item,
              payment_target: costInfo.payment_target,
              amount: costInfo.amount,
              period: costInfo.period,
              certificate: costInfo.certificate,
              withholding: costInfo.withholding,
              matter_id: costInfo.matter_id,
              comment: costInfo.comment,
              isNew: false,
              isRemoved: false,
            }))
          );
        }
      };
      getCostInfo();
    }
  }, [opened, matterInfo.id]);

  const form = useForm({
    initialValues: {
      id: matterInfo.id,
      name: matterInfo.name,
      team: matterInfo.team,
      category: matterInfo.category,
      amount: matterInfo.amount,
      is_fixed: matterInfo.is_fixed,
      costInfoInCardList: costInfoInCardList,
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

  const handleAddCost = () => {
    setCostInfoInCardList([
      ...costInfoInCardList,
      {
        id: costInfoIndex,
        name: "",
        item: "",
        amount: 0,
        payment_target: "",
        period: "",
        certificate: "",
        withholding: false,
        matter_id: 0,
        comment: "",
        isNew: true,
        isRemoved: false,
      },
    ]);
    setCostInfoIndex(costInfoIndex + 1);
  };

  const handleRemoveCost = (id: number) => {
    setCostInfoInCardList(
      costInfoInCardList.map((costInfo) => {
        if (costInfo.id === id) costInfo.isRemoved = true;
        return costInfo;
      })
    );
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
        {costInfoInCardList.length > 0 ? (
          <h2 className="my-4">コスト情報</h2>
        ) : (
          ""
        )}
        {costInfoInCardList?.map((cost) =>
          cost.isRemoved ? (
            ""
          ) : (
            <div className="flex items-center pb-2" key={cost.id}>
              <Group gap="sm" className="flex-grow" grow>
                <TextInput
                  placeholder="品名をご記入ください。"
                  className="flex-grow"
                  value={cost.name as string}
                  onChange={(event) =>
                    setCostInfoInCardList(
                      costInfoInCardList.map((costInfo) =>
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
                    setCostInfoInCardList(
                      costInfoInCardList.map((costInfo) =>
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
                    setCostInfoInCardList(
                      costInfoInCardList.map((costInfo) =>
                        costInfo.id === cost.id
                          ? { ...costInfo, price: Number(value) }
                          : costInfo
                      )
                    )
                  }
                />
              </Group>
              <div
                className="h-full px-2 text-lg hover:cursor-pointer ml-auto flex items-center justify-center"
                onClick={() => handleRemoveCost(cost.id)}
              >
                <FaRegTrashAlt />
              </div>
            </div>
          )
        )}
        <Button
          type="button"
          fullWidth
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          onClick={handleAddCost}
        >
          コスト追加
        </Button>

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
