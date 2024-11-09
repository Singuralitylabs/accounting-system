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
import { Modal, Button, Group, Badge } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import BusinessBlock from "../BusinessBlock";
import CostBlock from "../CostBlock";
import MatterInfoBlock, { MatterFormValues } from "../MatterInfoBlock";

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
  isNew?: boolean;
  isRemoved?: boolean;
} & CostType;

type BussinessInCardType = {
  isNew?: boolean;
  isRemoved?: boolean;
} & BusinessType;

export const MatterCardDetailModal = ({
  matterInfo,
  opened,
  setOpened,
}: Props) => {
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

  const form = useForm<MatterFormValues>({
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
      user_id: matterInfo.user_id,
      inserted_at: "",
      updated_at: "",
      is_completed: false,
      accounting_memo: "",
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
    matterInfo.start_date = updatedMatterInfo.start_date;
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
        certificate: "",
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
        {!matterInfo.is_fixed && (
          <span className="text-red-700 text-sm">
            ※全て税抜金額でご記入ください。
          </span>
        )}
        <div className="flex justify-end">
          {matterInfo.is_completed ? (
            <Badge color="green">経理確認完了</Badge>
          ) : matterInfo.is_fixed ? (
            <Badge color="blue">経理確認待ち</Badge>
          ) : (
            <Badge color="red">申請者編集中</Badge>
          )}
        </div>
        <h2>基本情報</h2>
        <MatterInfoBlock form={form} />

        {businessInfoInCardList.length > 0 && (
          <h2 className="my-4">取引先情報</h2>
        )}
        {businessInfoInCardList.map(
          (businessInfo, index) =>
            !businessInfo.isRemoved && (
              <BusinessBlock
                key={businessInfo.id}
                businessInfo={businessInfo}
                index={index}
                isFixed={matterInfo.is_fixed!}
                onRemoveBusiness={handleRemoveBusiness}
                onBusinessUpdate={(updatedBusiness) => {
                  setBusinessInfoInCardList(
                    businessInfoInCardList.map((businessVal) =>
                      businessVal.id === updatedBusiness.id
                        ? updatedBusiness
                        : businessVal
                    )
                  );
                }}
              />
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
        {costInfoInCardList.map(
          (costInfo, index) =>
            !costInfo.isRemoved && (
              <CostBlock
                key={costInfo.id}
                costInfo={costInfo}
                index={index}
                isFixed={matterInfo.is_fixed!}
                onRemoveCost={handleRemoveCost}
                onCostUpdate={(updatedCost) => {
                  setCostInfoInCardList(
                    costInfoInCardList.map((costVal) =>
                      costVal.id === updatedCost.id ? updatedCost : costVal
                    )
                  );
                }}
              />
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
              <Button type="button" onClick={handleFixMatterInfo}>
                確定
              </Button>
              <Button type="submit" color="red">
                更新
              </Button>
            </Group>
          </div>
        )}
      </form>
    </Modal>
  );
};
