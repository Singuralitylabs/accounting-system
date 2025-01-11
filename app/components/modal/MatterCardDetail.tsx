import {
  BusinessInCardType,
  CostInCardType,
  MatterType,
} from "@/app/types/types";
import {
  deleteBusinessInfo,
  deleteCostInfo,
  deleteMatterInfo,
  getUserBusinessInfoList,
  getUserCostInfoList,
} from "@/app/utils/supabaseServer";
import updateMatter from "@/app/utils/updateMatter";
import { Modal, Button, Group, Badge } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import BusinessBlock from "../BusinessBlock";
import CostBlock from "../CostBlock";
import MatterInfoBlock, { MatterFormValues } from "../MatterInfoBlock";
import insertMatter from "@/app/utils/insertMatter";

type Props = {
  matterInfo: MatterType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
  isNew: boolean;
  setIsNew: React.Dispatch<React.SetStateAction<boolean>>;
};

export const MatterCardDetailModal = ({
  matterInfo,
  opened,
  setOpened,
  isNew,
  setIsNew,
}: Props) => {
  const [costInfoIndex, setCostInfoIndex] = useState<number>(10000);
  const [costInfoInCardList, setCostInfoInCardList] = useState<
    CostInCardType[]
  >([]);
  const [businessInfoInCardList, setBusinessInfoInCardList] = useState<
    BusinessInCardType[]
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
              is_completed: costInfo.is_completed,
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
              is_completed: businessInfo.is_completed,
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
    setIsNew(false);
    setOpened(false);
    form.reset();
  };

  const handleAddMatterInfo = async (isFixed: boolean) => {
    if (isFixed) {
      const checkCreated = window.confirm(
        `案件[${form.getValues().title}]を経理申請しますか？`
      );
      if (!checkCreated) {
        alert(`案件[${form.getValues().title}]の経理申請を中止しました。`);
        return;
      }
    } else {
      const checkCreated = window.confirm(
        `案件[${
          form.getValues().title
        }]の下書きを作成しますか？\n作成した案件は経理申請扱いにはなりませんが、経理に共有はされます。`
      );
      if (!checkCreated) {
        alert(`案件[${form.getValues().title}]の下書き作成を中止しました。`);
        return;
      }
    }

    try {
      const matterInfo: MatterType = {
        id: 0,
        title: form.getValues().title,
        category: form.getValues().category,
        team: form.getValues().team,
        start_date: form.getValues().start_date,
        description: form.getValues().description,
        is_fixed: isFixed,
        is_completed: false,
        user_id: 1,
        accounting_memo: "",
        total_amount: 0,
        total_cost: 0,
        cost_count: costInfoInCardList.length,
        business_count: businessInfoInCardList.length,
        unchecked_cost_count: costInfoInCardList.length,
        inserted_at: "",
        updated_at: "",
      };

      const ret = await insertMatter(
        matterInfo,
        businessInfoInCardList,
        costInfoInCardList
      );
      if (ret) {
        if (isFixed) {
          alert(`${matterInfo.title}の経理申請を完了しました。`);
        } else {
          alert(
            `${matterInfo.title}の下書き作成を完了しました。\n経理申請まで忘れずご対応をお願い致します。`
          );
        }
        form.reset();
        closeModal();
      }
    } catch (error) {
      if (isFixed) {
        alert(`${form.getValues().title}の経理申請に失敗しました。`);
      } else {
        alert(`${form.getValues().title}の下書き作成に失敗しました。`);
      }
      console.error(error);
    }
  };

  const handleUpdateMatterInfo = async (isFixed: boolean) => {
    const checkUpdate = isFixed
      ? window.confirm(
          `案件[${matterInfo.title}]を経理申請しますか？\n申請後に更新が必要となった場合、経理まで連絡が必要です。`
        )
      : window.confirm(`案件[${matterInfo.title}]を更新しますか？`);
    if (!checkUpdate) {
      closeModal();
      return;
    }

    const updatedMatterInfo: MatterType = {
      ...matterInfo,
      title: form.values.title,
      category: form.values.category,
      team: form.values.team,
      start_date: form.values.start_date,
      description: form.values.description,
      is_fixed: isFixed,
    };

    try {
      const ret = await updateMatter(
        updatedMatterInfo,
        businessInfoInCardList,
        costInfoInCardList
      );
      if (ret) {
        Object.assign(matterInfo, updatedMatterInfo);
        if (isFixed) {
          alert(`案件[${form.values.title}]を経理申請しました。`);
        } else {
          alert(`案件[${form.values.title}]を更新しました。`);
        }
        closeModal();
      }
    } catch (err) {
      if (isFixed) {
        alert(`案件[${form.values.title}]の経理申請に失敗しました。`);
        console.error(
          `案件[${form.values.title}]の経理申請に失敗しました。`,
          err
        );
      } else {
        alert(`案件[${form.values.title}]の更新に失敗しました。`);
        console.error(`案件[${form.values.title}]の更新に失敗しました。`, err);
      }
    }
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
    for (const businessInfo of businessInfoInCardList) {
      await deleteBusinessInfo(businessInfo.id);
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
      <form onSubmit={form.onSubmit(() => handleUpdateMatterInfo(false))}>
        <div className="flex justify-end">
          {isNew ? (
            <Badge color="pink">新規作成</Badge>
          ) : matterInfo.is_completed ? (
            <Badge color="green">経理確認完了</Badge>
          ) : matterInfo.is_fixed ? (
            <Badge color="red">経理申請中</Badge>
          ) : (
            <Badge color="blue">下書き</Badge>
          )}
        </div>
        {!matterInfo.is_fixed && (
          <span className="text-red-700 text-sm">
            ※全て税抜金額でご記入ください。
          </span>
        )}
        <h2>基本情報</h2>
        <MatterInfoBlock
          form={form}
          isFixedMode={matterInfo.is_fixed || false}
        />

        <h2 className="my-4">取引先情報</h2>
        {businessInfoInCardList.map(
          (businessInfo, index) =>
            !businessInfo.isRemoved && (
              <BusinessBlock
                key={businessInfo.id}
                businessInfo={businessInfo}
                formType="card"
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

        <h2 className="mt-8 mb-4">コスト情報</h2>
        {costInfoInCardList.map(
          (costInfo, index) =>
            !costInfo.isRemoved && (
              <CostBlock
                key={costInfo.id}
                costInfo={costInfo}
                formType="card"
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
              {isNew ? (
                <Button
                  onClick={() => {
                    const validation = form.validate();
                    if (validation.hasErrors) {
                      return;
                    }
                    handleAddMatterInfo(false);
                  }}
                >
                  下書き作成
                </Button>
              ) : (
                <Button type="submit">更新</Button>
              )}
              <Button
                type="button"
                color="red"
                onClick={() => {
                  const validation = form.validate();
                  if (validation.hasErrors) {
                    return;
                  }
                  isNew
                    ? handleAddMatterInfo(true)
                    : handleUpdateMatterInfo(true);
                }}
              >
                経理申請
              </Button>
            </Group>
          </div>
        )}
      </form>
    </Modal>
  );
};
