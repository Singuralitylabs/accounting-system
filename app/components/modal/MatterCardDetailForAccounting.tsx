import {
  categoryList,
  certificateList,
  itemList,
  teamList,
} from "@/app/types/params";
import { CostType, MatterType } from "@/app/types/types";
import { getUserCostInfoList } from "@/app/utils/supabaseServer";
import {
  Modal,
  TextInput,
  NumberInput,
  Select,
  Group,
  Card,
  Checkbox,
  Badge,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";
import { DateInput } from "@mantine/dates";

type Props = {
  matterInfo: MatterType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

type CostInCardType = {
  isNew: boolean;
  isRemoved: boolean;
} & CostType;

export const MatterCardDetailModalForAccounting = ({
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

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title={matterInfo.title}
      size="100%"
    >
      <form>
        <div className="flex justify-end">
          {matterInfo.is_completed ? (
            <Badge color="green">経理確認完了</Badge>
          ) : matterInfo.is_fixed ? (
            <Badge color="blue">経理確認待ち</Badge>
          ) : (
            <Badge color="red">申請者編集中</Badge>
          )}
        </div>
        <div className="sm:flex gap-4 w-full">
          <TextInput
            className="w-full"
            withAsterisk
            label="案件名"
            placeholder="案件名をご記入ください。"
            required
            disabled={true}
            {...form.getInputProps("title")}
          />
          <TextInput
            className="w-full md:pt-0 pt-4"
            withAsterisk
            label="取引先"
            placeholder="取引先をご記入ください。"
            disabled={true}
            {...form.getInputProps("billing_address")}
          />
        </div>
        <div className="sm:flex gap-4 w-full">
          <Select
            label="分類"
            className="pt-4 w-full"
            placeholder="案件の分類をご記入ください。"
            data={categoryList}
            required
            disabled={true}
            {...form.getInputProps("category")}
          />
          <Select
            label="チーム"
            className="pt-4 w-full"
            placeholder="案件を担当するチームを選択ください。"
            data={teamList}
            required
            disabled={true}
            {...form.getInputProps("team")}
          />
          <NumberInput
            label="請求額"
            className="pt-4 w-full"
            placeholder="協会が取引先に請求する金額をご記入ください。"
            min={0}
            prefix="¥"
            allowNegative={false}
            allowDecimal={false}
            thousandSeparator=","
            disabled={true}
            {...form.getInputProps("amount")}
          />
        </div>
        <div className="sm:flex gap-4 w-full">
          <DateInput
            label="案件開始日"
            className="pt-4 w-full"
            required
            placeholder="案件を開始した日付をご入力ください。"
            disabled={true}
            valueFormat="YYYY/MM/DD"
            value={startDate}
            onChange={(value) =>
              value ? setStartDate(value) : setStartDate(null)
            }
          />
          <DateInput
            label="請求日"
            className="pt-4 w-full"
            placeholder="案件に対する報酬を請求する日付をご入力ください。"
            disabled={true}
            valueFormat="YYYY/MM/DD"
            value={invoiceDate}
            onChange={(value) =>
              value ? setInvoiceDate(value) : setInvoiceDate(null)
            }
          />
          <DateInput
            label="振込期限"
            className="pt-4 w-full"
            placeholder="案件の報酬の振込期限をご入力ください。"
            disabled={true}
            valueFormat="YYYY/MM/DD"
            value={periodDate}
            onChange={(value) =>
              value ? setPeriodDate(value) : setPeriodDate(null)
            }
          />
        </div>
        <Textarea
          label="説明"
          className="pt-4 w-full"
          disabled={true}
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
              radius="sm"
              padding="lg"
              aria-label="コスト"
            >
              {!matterInfo.is_fixed ? (
                <div className="flex justify-between w-full mb-2">
                  <div>コスト{index + 1}</div>
                </div>
              ) : null}
              <div className="flex-grow">
                <div className="flex pb-2">
                  <Group gap="sm" className="flex-grow w-full">
                    <TextInput
                      placeholder="品名をご記入ください。"
                      className="flex-grow"
                      disabled={true}
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
                      disabled={true}
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
                      disabled={true}
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
                      disabled={true}
                      value={cost.period ? new Date(cost.period) : null}
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
                      disabled={true}
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
                      disabled={true}
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
                      disabled={true}
                      checked={cost.withholding}
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
                    disabled={true}
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
      </form>
    </Modal>
  );
};
