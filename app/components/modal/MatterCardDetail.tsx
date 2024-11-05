import {
  categoryList,
  certificateList,
  itemList,
  teamList,
} from "@/app/types/params";
import { BusinessType, CostType, MatterType } from "@/app/types/types";
import {
  deleteBusinessInfo,
  deleteCostInfo,
  deleteMatterInfo,
  getUserBusinessInfoList,
  getUserCostInfoList,
  insertBusinessInfo,
  insertCostInfo,
  updateBusinessInfo,
  updateCostInfo,
  updateMatterInfo,
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
  Badge,
  Textarea,
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
  team: string;
  category: string;
  start_date: string | null;
  total_amount: number;
  business_count: number;
  total_cost: number;
  cost_count: number;
  description: string | null;
};

type CostInCardType = {
  isNew: boolean;
  isRemoved: boolean;
} & CostType;

type BussinessInCardType = {
  isNew: boolean;
  isRemoved: boolean;
} & BusinessType;

export const MatterCardDetailModal = ({
  matterInfo,
  opened,
  setOpened,
}: Props) => {
  const [startDate, setStartDate] = useState<Date | null>(
    new Date(matterInfo.start_date!)
  );
  const [costInfoIndex, setCostInfoIndex] = useState<number>(10000);
  const [costInfoInCardList, setCostInfoInCardList] = useState<
    CostInCardType[]
  >([]);
  const [businessInfoInCardList, setBusinessInfoInCardList] = useState<
    BussinessInCardType[]
  >([]);
  const [businessInfoIndex, setBusinessInfoIndex] = useState<number>(10000);
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
              is_completed: false,
              inserted_at: costInfo.inserted_at,
              updated_at: costInfo.updated_at,
              isNew: false,
              isRemoved: false,
            }))
          );
        }
      };
      getCostInfo();
      const getBusinessInfo = async () => {
        const { businessInfoList, error } = await getUserBusinessInfoList(
          matterInfo.id
        );

        if (error) {
          console.error("Error fetching businessInfoList:", error);
          return <div>取引先情報の取得に失敗しました。</div>;
        }
        if (businessInfoList) {
          setBusinessInfoInCardList(
            businessInfoList.map((businessInfo) => ({
              id: businessInfo.id,
              name: businessInfo.name,
              amount: businessInfo.amount,
              invoice_date: businessInfo.invoice_date,
              period_date: businessInfo.period_date,
              matter_id: matterInfo.id,
              is_completed: false,
              inserted_at: businessInfo.inserted_at,
              updated_at: businessInfo.updated_at,
              isNew: false,
              isRemoved: false,
            }))
          );
        }
      };
      getBusinessInfo();
    }
  }, [opened, matterInfo.id]);

  const form = useForm({
    initialValues: {
      id: matterInfo.id,
      title: matterInfo.title,
      team: matterInfo.team,
      category: matterInfo.category,
      start_date: matterInfo.start_date,
      total_amount: matterInfo.total_amount,
      business_count: matterInfo.business_count,
      total_cost: matterInfo.total_cost,
      cost_count: matterInfo.cost_count,
      is_fixed: matterInfo.is_fixed,
      description: matterInfo.description,
    },
  });

  const closeModal = () => {
    setOpened(false);
    form.reset();
  };

  const handleUpdateMatterInfo = async (
    updatedMatterInfo: UpdatedMatterInfoType
  ) => {
    const checkUpdate = window.confirm(
      `案件[${updatedMatterInfo.title}]を更新しますか？`
    );
    if (!checkUpdate) {
      closeModal();
      return;
    }

    const totalAmount = businessInfoInCardList.reduce((acc, business) => {
      return business.amount && !business.isRemoved
        ? acc + business.amount
        : acc;
    }, 0);
    const totalCost = costInfoInCardList.reduce((acc, cost) => {
      return cost.price && !cost.isRemoved ? acc + cost.price : acc;
    }, 0);

    matterInfo.title = updatedMatterInfo.title;
    matterInfo.category = updatedMatterInfo.category;
    matterInfo.team = updatedMatterInfo.team;
    matterInfo.start_date = startDate?.toISOString() || null;
    matterInfo.total_amount = totalAmount;
    matterInfo.business_count = businessInfoInCardList.filter(
      (business) => !business.isRemoved
    ).length;
    matterInfo.total_cost = totalCost;
    matterInfo.cost_count = costInfoInCardList.filter(
      (cost) => !cost.isRemoved
    ).length;
    matterInfo.description = updatedMatterInfo.description;

    await updateMatterInfo(matterInfo);

    for (const costInfoInCard of costInfoInCardList) {
      if (costInfoInCard.isNew && !costInfoInCard.isRemoved) {
        await insertCostInfo(
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
        await deleteCostInfo(costInfoInCard.id);
      } else if (!costInfoInCard.isNew && !costInfoInCard.isRemoved) {
        await updateCostInfo(
          costInfoInCard.id,
          costInfoInCard.name,
          costInfoInCard.item,
          costInfoInCard.payment_target,
          costInfoInCard.price,
          costInfoInCard.period ?? "",
          costInfoInCard.certificate,
          costInfoInCard.withholding,
          costInfoInCard.matter_id,
          costInfoInCard.comment ?? "",
          costInfoInCard.is_completed
        );
      }
    }

    for (const businessInfoInCard of businessInfoInCardList) {
      if (businessInfoInCard.isNew && !businessInfoInCard.isRemoved) {
        await insertBusinessInfo(
          businessInfoInCard.name,
          businessInfoInCard.amount!,
          businessInfoInCard.invoice_date!,
          businessInfoInCard.period_date!,
          matterInfo.id
        );
      } else if (businessInfoInCard.isRemoved && !businessInfoInCard.isNew) {
        await deleteBusinessInfo(businessInfoInCard.id);
      } else if (!businessInfoInCard.isNew && !businessInfoInCard.isRemoved) {
        await updateBusinessInfo(
          businessInfoInCard.id,
          businessInfoInCard.name,
          businessInfoInCard.amount!,
          businessInfoInCard.invoice_date!,
          businessInfoInCard.period_date!,
          matterInfo.id,
          businessInfoInCard.is_completed
        );
      }
    }

    alert(`案件[${matterInfo.title}]を更新しました。`);
    closeModal();
  };

  const handleFixMatterInfo = async () => {
    matterInfo.is_fixed = window.confirm(
      `案件[${matterInfo.title}]を確定にしますか？\n確定後は経理の確認に入るため、変更できません。`
    );
    if (!matterInfo.is_fixed) {
      closeModal();
      return;
    }
    try {
      await updateMatterInfo(matterInfo);
    } catch (err) {
      console.error("案件の確定に失敗しました。", err);
    }
    alert(`案件[${matterInfo.title}]を確定しました。`);
    closeModal();
  };

  const handleDeleteMatterInfo = async () => {
    const checkDelete = window.confirm(
      `案件[${matterInfo.title}]を削除してよろしいですか？`
    );
    if (!checkDelete) {
      alert(`案件[${matterInfo.title}]の削除を中止しました。`);
      closeModal();
      return;
    }
    for (const costInfo of costInfoInCardList) {
      await deleteCostInfo(costInfo.id);
    }
    await deleteMatterInfo(matterInfo.id);
    alert(`案件[${matterInfo.title}]を削除しました。`);
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
        is_completed: false,
        inserted_at: "",
        updated_at: "",
        isNew: true,
        isRemoved: false,
      },
    ]);
    setCostInfoIndex(costInfoIndex + 1);
  };

  const handleAddBusiness = () => {
    setBusinessInfoInCardList([
      ...businessInfoInCardList,
      {
        id: businessInfoIndex,
        name: "",
        amount: 0,
        invoice_date: "",
        period_date: "",
        matter_id: matterInfo.id,
        is_completed: false,
        inserted_at: "",
        updated_at: "",
        isNew: true,
        isRemoved: false,
      },
    ]);
    setBusinessInfoIndex(businessInfoIndex + 1);
  };

  const handleRemoveCost = (id: number) => {
    setCostInfoInCardList(
      costInfoInCardList.map((costInfo) => {
        if (costInfo.id === id) costInfo.isRemoved = true;
        return costInfo;
      })
    );
  };

  const handleRemoveBusiness = (id: number) => {
    setBusinessInfoInCardList(
      businessInfoInCardList.map((businessInfo) => {
        if (businessInfo.id === id) businessInfo.isRemoved = true;
        return businessInfo;
      })
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title={matterInfo.title}
      size="100%"
    >
      <form
        onSubmit={form.onSubmit((updatedMatterInfo) => {
          handleUpdateMatterInfo({
            ...updatedMatterInfo,
            total_amount: 0,
            business_count: businessInfoInCardList.length,
            total_cost: 0,
            cost_count: costInfoInCardList.length,
          });
        })}
      >
        <span className="text-red-700 text-sm">
          ※全て税抜金額でご記入ください。
        </span>
        <div className="flex justify-end">
          {matterInfo.is_completed ? (
            <Badge color="green">経理確認完了</Badge>
          ) : matterInfo.is_fixed ? (
            <Badge color="blue">経理確認待ち</Badge>
          ) : (
            <Badge color="red">申請者編集中</Badge>
          )}
        </div>
        <h2 className="mb-4">基本情報</h2>
        <div className="sm:flex gap-4 w-full">
          <TextInput
            className="w-full"
            withAsterisk
            label="案件名"
            placeholder="案件名をご記入ください。"
            required
            disabled={matterInfo.is_fixed!}
            {...form.getInputProps("title")}
          />
          <Select
            label="分類"
            className="w-full"
            placeholder="案件の分類をご記入ください。"
            data={categoryList}
            required
            disabled={matterInfo.is_fixed!}
            {...form.getInputProps("category")}
          />
          <Select
            label="チーム"
            className="w-full"
            placeholder="案件を担当するチームを選択ください。"
            data={teamList}
            required
            disabled={matterInfo.is_fixed!}
            {...form.getInputProps("team")}
          />
          <DateInput
            label="案件開始日"
            className="w-full"
            required
            placeholder="案件を開始した日付をご入力ください。"
            disabled={matterInfo.is_fixed!}
            valueFormat="YYYY/MM/DD"
            value={startDate}
            onChange={(value) =>
              value ? setStartDate(value) : setStartDate(null)
            }
          />
        </div>
        <Textarea
          label="説明"
          className="pt-4 w-full"
          disabled={matterInfo.is_fixed!}
          placeholder="案件に追加の説明があればご記入ください。"
          {...form.getInputProps("description")}
        />

        {businessInfoInCardList.length > 0 && (
          <h2 className="mt-8 mb-4">取引先情報</h2>
        )}
        {businessInfoInCardList.map((businessInfo, index) =>
          businessInfo.isRemoved ? (
            ""
          ) : (
            <div
              key={businessInfo.id}
              className="md:flex md:border-none border rounded-lg md:p-0 p-2 my-2 items-center md:bg-white bg-green-50"
            >
              {!matterInfo.is_fixed && (
                <div className="md:hidden flex justify-between w-full mb-2">
                  <div>取引先{index + 1}</div>
                  <button
                    className="p-2 hover:text-blue-500"
                    onClick={() => handleRemoveBusiness(businessInfo.id)}
                  >
                    <FaRegTrashAlt />
                  </button>
                </div>
              )}
              <div className="md:flex gap-4 w-full">
                <div className="sm:flex md:my-0 my-2 gap-4 w-full">
                  <TextInput
                    placeholder="取引先名をご記入ください。"
                    className="flex-grow sm:my-0 my-2 "
                    disabled={matterInfo.is_fixed!}
                    value={businessInfo.name}
                    onChange={(event) =>
                      setBusinessInfoInCardList(
                        businessInfoInCardList.map((businessVal) =>
                          businessVal.id === businessInfo.id
                            ? { ...businessVal, name: event.target.value }
                            : businessVal
                        )
                      )
                    }
                  />
                  <NumberInput
                    placeholder="¥0"
                    className="flex-grow"
                    disabled={matterInfo.is_fixed!}
                    value={businessInfo.amount!}
                    prefix="¥"
                    allowNegative={false}
                    allowDecimal={false}
                    thousandSeparator=","
                    onChange={(value) =>
                      setBusinessInfoInCardList(
                        businessInfoInCardList.map((businessVal) =>
                          businessVal.id === businessInfo.id
                            ? { ...businessVal, amount: Number(value) }
                            : businessVal
                        )
                      )
                    }
                  />
                </div>
                <div className="sm:flex gap-4 w-full">
                  <DateInput
                    className="flex-grow sm:my-0 my-2 "
                    placeholder="請求日をご記入ください。"
                    disabled={matterInfo.is_fixed!}
                    value={
                      businessInfo.invoice_date
                        ? new Date(businessInfo.invoice_date)
                        : null
                    }
                    valueFormat="YYYY/MM/DD"
                    onChange={(event) => {
                      const dateString = event
                        ? event.toISOString().split("T")[0]
                        : null;
                      setBusinessInfoInCardList(
                        businessInfoInCardList.map((businessVal) =>
                          businessVal.id === businessInfo.id
                            ? { ...businessVal, invoice_date: dateString }
                            : businessVal
                        )
                      );
                    }}
                  />
                  <DateInput
                    className="flex-grow"
                    placeholder="振込期限をご記入ください。"
                    disabled={matterInfo.is_fixed!}
                    value={
                      businessInfo.period_date
                        ? new Date(businessInfo.period_date!)
                        : null
                    }
                    valueFormat="YYYY/MM/DD"
                    onChange={(event) => {
                      const dateString = event
                        ? event.toISOString().split("T")[0]
                        : null;
                      setBusinessInfoInCardList(
                        businessInfoInCardList.map((businessVal) =>
                          businessVal.id === businessInfo.id
                            ? { ...businessVal, period_date: dateString }
                            : businessVal
                        )
                      );
                    }}
                  />
                </div>
              </div>
              {!matterInfo.is_fixed && (
                <button
                  className="hidden md:block p-2 hover:text-blue-500"
                  onClick={() => handleRemoveBusiness(businessInfo.id)}
                >
                  <FaRegTrashAlt />
                </button>
              )}
            </div>
          )
        )}

        {!matterInfo.is_fixed && (
          <Button
            type="button"
            fullWidth
            className="mt-4"
            color="dark"
            variant="outline"
            rightSection={<CiSquarePlus />}
            onClick={handleAddBusiness}
          >
            取引先追加
          </Button>
        )}

        {costInfoInCardList.length > 0 && (
          <h2 className="mt-8 mb-4">コスト情報</h2>
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
              padding="sm"
              aria-label="コスト"
              bg="gray.1"
            >
              {!matterInfo.is_fixed && (
                <div className="flex justify-between w-full mb-2">
                  <div>コスト{index + 1}</div>
                  <div
                    className="h-full px-4 text-lg hover:cursor-pointer w-4 ml-auto items-center justify-center hover:text-blue-500"
                    onClick={() => handleRemoveCost(cost.id)}
                  >
                    <FaRegTrashAlt />
                  </div>
                </div>
              )}
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
                      checked={cost.withholding}
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
        {!matterInfo.is_fixed && (
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
        )}

        {!matterInfo.is_fixed && (
          <div className="flex justify-between mt-6">
            <Group justify="flex-end" mt="md">
              <Button
                type="button"
                color="gray"
                onClick={handleDeleteMatterInfo}
              >
                削除
              </Button>
            </Group>
            <Group justify="flex-end" mt="md">
              <Button type="button" onClick={handleFixMatterInfo} color="red">
                確定
              </Button>
              <Button type="submit" color="green">
                更新
              </Button>
            </Group>
          </div>
        )}
      </form>
    </Modal>
  );
};
