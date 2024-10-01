import {
  categoryList,
  certificateList,
  itemList,
  teamList,
} from "@/app/types/params";
import { CostType, MatterType } from "@/app/types/types";
import {
  deleteCostInfoInSupabase,
  deleteMatterInfoInSupabase,
  getUserCostInfoList,
  insertCostInfoInSupabase,
  updateCostInfoInSupabase,
  updateMatterInfoInSupabase,
} from "@/app/utils/supabaseServer";
import {
  Modal,
  TextInput,
  NumberInput,
  Select,
  Button,
  Group,
  Card,
  Checkbox,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";
import { FaRegTrashAlt } from "react-icons/fa";
import { CiSquarePlus } from "react-icons/ci";
import { DateInput } from "@mantine/dates";

type Props = {
  matterInfo: MatterType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

type UpdatedMatterInfoType = {
  title: string;
  billing_address: string | null;
  team: string;
  category: string;
  amount: number | null;
  start_date: string | null;
  invoice_date: string | null;
  period_date: string | null;
  description: string | null;
};

type CostInCardType = {
  isNew: boolean;
  isRemoved: boolean;
} & CostType;

export const MatterCardDetailModal = ({
  matterInfo,
  opened,
  setOpened,
}: Props) => {
  const [startDate, setStartDate] = useState<Date | null>(
    new Date(matterInfo.start_date!)
  );
  const [invoiceDate, setInvoiceDate] = useState<Date | null>(
    new Date(matterInfo.invoice_date!)
  );
  const [periodDate, setPeriodDate] = useState<Date | null>(
    new Date(matterInfo.period_date!)
  );
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
              price: costInfo.price,
              period: costInfo.period,
              certificate: costInfo.certificate,
              withholding: costInfo.withholding,
              matter_id: costInfo.matter_id,
              comment: costInfo.comment,
              inserted_at: costInfo.inserted_at,
              updated_at: costInfo.updated_at,
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
      title: matterInfo.title,
      team: matterInfo.team,
      category: matterInfo.category,
      amount: matterInfo.amount,
      billing_address: matterInfo.billing_address,
      start_date: matterInfo.start_date,
      invoice_date: matterInfo.invoice_date,
      period_date: matterInfo.period_date,
      is_fixed: matterInfo.is_fixed,
      description: matterInfo.description,
      costInfoInCardList: costInfoInCardList,
    },
  });

  const closeModal = () => {
    setOpened(false);
    form.reset();
  };

  const handleUpdateMatterInfo = async (
    updatedMatterInfo: UpdatedMatterInfoType
  ) => {
    matterInfo.title = updatedMatterInfo.title;
    matterInfo.category = updatedMatterInfo.category;
    matterInfo.team = updatedMatterInfo.team;
    matterInfo.amount = updatedMatterInfo.amount;
    matterInfo.billing_address = updatedMatterInfo.billing_address;
    matterInfo.start_date = startDate?.toISOString() || null;
    matterInfo.invoice_date = invoiceDate?.toISOString() || null;
    matterInfo.period_date = periodDate?.toISOString() || null;
    matterInfo.description = updatedMatterInfo.description;

    await updateMatterInfoInSupabase(matterInfo);

    for (const costInfoInCard of costInfoInCardList) {
      if (costInfoInCard.isNew && !costInfoInCard.isRemoved) {
        await insertCostInfoInSupabase(
          costInfoInCard.name,
          costInfoInCard.item,
          costInfoInCard.payment_target,
          costInfoInCard.price,
          costInfoInCard.period ?? "",
          costInfoInCard.certificate,
          costInfoInCard.withholding,
          costInfoInCard.matter_id,
          costInfoInCard.comment ?? ""
        );
      } else if (costInfoInCard.isRemoved && !costInfoInCard.isNew) {
        await deleteCostInfoInSupabase(costInfoInCard.id);
      } else if (!costInfoInCard.isNew && !costInfoInCard.isRemoved) {
        await updateCostInfoInSupabase(
          costInfoInCard.id,
          costInfoInCard.name,
          costInfoInCard.item,
          costInfoInCard.payment_target,
          costInfoInCard.price,
          costInfoInCard.period ?? "",
          costInfoInCard.certificate,
          costInfoInCard.withholding,
          costInfoInCard.matter_id,
          costInfoInCard.comment ?? ""
        );
      }
    }

    closeModal();
  };

  const handleDeleteMatterInfo = async () => {
    for (const costInfo of costInfoInCardList) {
      await deleteCostInfoInSupabase(costInfo.id);
    }
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
        price: 0,
        payment_target: "",
        period: "",
        certificate: "請求書",
        withholding: false,
        matter_id: matterInfo.id,
        comment: "",
        inserted_at: "",
        updated_at: "",
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
    <Modal opened={opened} onClose={closeModal} title={matterInfo.title}>
      <form
        onSubmit={form.onSubmit((updatedMatterInfo) => {
          handleUpdateMatterInfo(updatedMatterInfo);
        })}
      >
        <TextInput
          withAsterisk
          label="案件名"
          placeholder="案件名をご記入ください。"
          required
          disabled={matterInfo.is_fixed!}
          {...form.getInputProps("title")}
        />
        <TextInput
          withAsterisk
          label="取引先"
          placeholder="取引先をご記入ください。"
          disabled={matterInfo.is_fixed!}
          {...form.getInputProps("billing_address")}
        />
        <Select
          label="分類"
          placeholder="案件の分類をご記入ください。"
          data={categoryList}
          required
          disabled={matterInfo.is_fixed!}
          {...form.getInputProps("category")}
        />
        <Select
          label="チーム"
          placeholder="案件を担当するチームを選択ください。"
          data={teamList}
          required
          disabled={matterInfo.is_fixed!}
          {...form.getInputProps("team")}
        />
        <NumberInput
          label="請求額"
          placeholder="協会が取引先に請求する金額をご記入ください。"
          min={0}
          prefix="¥"
          allowNegative={false}
          allowDecimal={false}
          thousandSeparator=","
          disabled={matterInfo.is_fixed!}
          {...form.getInputProps("amount")}
        />
        <DateInput
          label="案件開始日"
          required
          placeholder="案件を開始した日付をご入力ください。"
          disabled={matterInfo.is_fixed!}
          valueFormat="YYYY/MM/DD"
          value={startDate}
          onChange={(value) =>
            value ? setStartDate(value) : setStartDate(null)
          }
        />
        <DateInput
          label="請求日"
          placeholder="案件に対する報酬を請求する日付をご入力ください。"
          disabled={matterInfo.is_fixed!}
          valueFormat="YYYY/MM/DD"
          value={invoiceDate}
          onChange={(value) =>
            value ? setInvoiceDate(value) : setInvoiceDate(null)
          }
        />
        <DateInput
          label="振込期限"
          placeholder="案件の報酬の振込期限をご入力ください。"
          disabled={matterInfo.is_fixed!}
          valueFormat="YYYY/MM/DD"
          value={periodDate}
          onChange={(value) =>
            value ? setPeriodDate(value) : setPeriodDate(null)
          }
        />
        <TextInput
          label="説明"
          disabled={matterInfo.is_fixed!}
          placeholder="案件に追加の説明があればご記入ください。"
          {...form.getInputProps("description")}
        />

        {costInfoInCardList.length > 0 ? (
          <h2 className="my-4">コスト情報</h2>
        ) : (
          ""
        )}
        {costInfoInCardList?.map((cost, index) =>
          cost.isRemoved ? (
            ""
          ) : (
            <Card
              key={cost.id}
              className="sm:flex items-center mb-4"
              withBorder
              radius="lg"
              padding="lg"
              aria-label="コスト"
            >
              {!matterInfo.is_fixed ? (
                <div className="flex justify-between w-full mb-2">
                  <div>コスト{index + 1}</div>
                  <div
                    className="h-full px-4 text-lg hover:cursor-pointer w-4 ml-auto items-center justify-center"
                    onClick={() => handleRemoveCost(cost.id)}
                  >
                    <FaRegTrashAlt />
                  </div>
                </div>
              ) : null}
              <div className="flex-grow">
                <div className="flex pb-2">
                  <Group gap="sm" className="flex-grow w-full">
                    <TextInput
                      placeholder="品名をご記入ください。"
                      className="flex-grow"
                      disabled={matterInfo.is_fixed!}
                      value={cost.name}
                      onChange={(event) =>
                        setCostInfoInCardList(
                          costInfoInCardList.map((costVal) =>
                            costVal.id === cost.id
                              ? { ...costVal, name: event.target.value }
                              : costVal
                          )
                        )
                      }
                    />
                    <Select
                      className="flex-grow"
                      placeholder="品目を選択ください。"
                      data={itemList}
                      required
                      disabled={matterInfo.is_fixed!}
                      value={cost.item}
                      onChange={(value) =>
                        setCostInfoInCardList(
                          costInfoInCardList.map((costVal) =>
                            costVal.id === cost.id
                              ? { ...costVal, item: value || "" }
                              : costVal
                          )
                        )
                      }
                    />
                    <NumberInput
                      placeholder="¥0"
                      className="flex-grow"
                      disabled={matterInfo.is_fixed!}
                      value={cost.price}
                      prefix="¥"
                      allowNegative={false}
                      allowDecimal={false}
                      thousandSeparator=","
                      onChange={(value) =>
                        setCostInfoInCardList(
                          costInfoInCardList.map((costVal) =>
                            costVal.id === cost.id
                              ? { ...costVal, price: Number(value) }
                              : costVal
                          )
                        )
                      }
                    />
                  </Group>
                </div>
                <div className="sm:flex flex-col sm:flex-row items-center pb-2">
                  <Group gap="sm" className="flex-grow">
                    <DateInput
                      className="flex-grow"
                      placeholder="支払い期限をご記入ください。"
                      disabled={matterInfo.is_fixed!}
                      valueFormat="YYYY/MM/DD"
                      onChange={(event) => {
                        const dateString = event
                          ? event.toISOString().split("T")[0]
                          : null;
                        setCostInfoInCardList(
                          costInfoInCardList.map((costVal) =>
                            costVal.id === cost.id
                              ? { ...costVal, period: dateString }
                              : costVal
                          )
                        );
                      }}
                    />
                    <TextInput
                      placeholder="支払い先の名前をご記入ください。"
                      className="flex-grow"
                      disabled={matterInfo.is_fixed!}
                      value={cost.payment_target}
                      onChange={(event) =>
                        setCostInfoInCardList(
                          costInfoInCardList.map((costVal) =>
                            costVal.id === cost.id
                              ? {
                                  ...costVal,
                                  payment_target: event.target.value,
                                }
                              : costVal
                          )
                        )
                      }
                    />
                    <Select
                      className="flex-grow"
                      placeholder="支払いの通知方法を選択ください。"
                      data={certificateList}
                      required
                      disabled={matterInfo.is_fixed!}
                      value={cost.certificate}
                      onChange={(value) =>
                        setCostInfoInCardList(
                          costInfoInCardList.map((costVal) =>
                            costVal.id === cost.id
                              ? { ...costVal, certificate: value || "" }
                              : costVal
                          )
                        )
                      }
                    />
                    <Checkbox
                      label="源泉徴収あり"
                      disabled={matterInfo.is_fixed!}
                      key={form.key("withholding")}
                      {...form.getInputProps("withholding", {
                        type: "checkbox",
                      })}
                      onChange={(value) =>
                        setCostInfoInCardList(
                          costInfoInCardList.map((costVal) =>
                            costVal.id === cost.id
                              ? {
                                  ...costVal,
                                  withholding: value.currentTarget.checked,
                                }
                              : costVal
                          )
                        )
                      }
                    />
                  </Group>
                </div>
                <div className="flex items-center pb-2">
                  <TextInput
                    placeholder="コメントがあればご記入ください。"
                    className="flex-grow w-full"
                    disabled={matterInfo.is_fixed!}
                    value={cost.comment ? cost.comment : ""}
                    onChange={(event) =>
                      setCostInfoInCardList(
                        costInfoInCardList.map((costVal) =>
                          costVal.id === cost.id
                            ? { ...costVal, comment: event.target.value }
                            : costVal
                        )
                      )
                    }
                  />
                </div>
              </div>
            </Card>
          )
        )}
        {!matterInfo.is_fixed ? (
          <Button
            type="button"
            fullWidth
            className="mt-4"
            color="dark"
            variant="outline"
            rightSection={<CiSquarePlus />}
            onClick={handleAddCost}
          >
            コスト追加
          </Button>
        ) : null}

        <div className="border-spacing-3 h-6"></div>
        <div className="flex justify-between">
          {!matterInfo.is_fixed ? (
            <Group justify="flex-end" mt="md">
              <Button
                type="button"
                color="gray"
                onClick={handleDeleteMatterInfo}
              >
                削除
              </Button>
            </Group>
          ) : null}
          <Group justify="flex-end" mt="md">
            <Button type="button" color="pink" onClick={closeModal}>
              キャンセル
            </Button>
            {!matterInfo.is_fixed ? (
              <Button type="submit" color="green">
                更新
              </Button>
            ) : null}
          </Group>
        </div>
      </form>
    </Modal>
  );
};
