import {
  BusinessInCardType,
  CostInCardType,
  MatterType,
} from "@/app/types/types";
import {
  getUserBusinessInfoList,
  getUserCostInfoList,
} from "@/app/utils/supabaseServer";
import { Modal, Button, Group, Badge, LoadingOverlay } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import BusinessBlock from "../BusinessBlock";
import CostBlock from "../CostBlock";
import MatterInfoBlock from "../MatterInfoBlock";
import deleteMatter from "@/app/utils/deleteMatter";
import addMatterInfo from "@/app/utils/addMatterInfo";
import editMatterInfo from "@/app/utils/editMatterInfo";

type Props = {
  matterInfo: MatterType;
  teamList: string[];
  categoryList: string[];
  itemList: string[];
  certificateList: string[];
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
  isNew: boolean;
  setIsNew: React.Dispatch<React.SetStateAction<boolean>>;
};

export const MatterCardDetailModal = ({
  matterInfo,
  teamList,
  categoryList,
  itemList,
  certificateList,
  opened,
  setOpened,
  isNew,
  setIsNew,
}: Props) => {
  const [costInfoInCardList, setCostInfoInCardList] = useState<
    CostInCardType[]
  >([]);
  const [businessInfoInCardList, setBusinessInfoInCardList] = useState<
    BusinessInCardType[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

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
              ...costInfo,
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
              ...businessInfo,
              isNew: false,
              isRemoved: false,
            }))
          );
        }
      };
      getBusinessInfo();
    }
  }, [opened, matterInfo.id]);

  const form = useForm<MatterType>({
    initialValues: {
      ...matterInfo,
    },
  });

  const closeModal = () => {
    setIsNew(false);
    setOpened(false);
    form.reset();
  };

  const handleAddMatterInfo = async (isFixed: boolean) => {
    setIsLoading(true);
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
    const ret = await addMatterInfo(
      matterInfo,
      businessInfoInCardList.filter((businessInfo) => !businessInfo.isRemoved),
      costInfoInCardList.filter((costInfo) => !costInfo.isRemoved)
    );
    setIsLoading(false);
    if (ret) {
      form.reset();
      closeModal();
    }
  };

  const handleUpdateMatterInfo = async (isFixed: boolean) => {
    setIsLoading(true);
    const updatedMatterInfo: MatterType = {
      ...matterInfo,
      title: form.values.title,
      category: form.values.category,
      team: form.values.team,
      start_date: form.values.start_date,
      description: form.values.description,
      is_fixed: isFixed,
    };

    const ret = await editMatterInfo(
      updatedMatterInfo,
      businessInfoInCardList,
      costInfoInCardList
    );
    setIsLoading(false);

    if (ret) {
      closeModal();
    }
  };

  const handleDeleteMatterInfo = async () => {
    setIsLoading(true);
    await deleteMatter(matterInfo);
    setIsLoading(false);
    closeModal();
  };

  const handleAddCost = () => {
    const newId = Math.max(...costInfoInCardList.map((cost) => cost.id)) + 1;
    setCostInfoInCardList([
      ...costInfoInCardList,
      {
        id: newId,
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
  };

  const handleAddBusiness = () => {
    const newId =
      Math.max(...businessInfoInCardList.map((business) => business.id)) + 1;
    setBusinessInfoInCardList([
      ...businessInfoInCardList,
      {
        id: newId,
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
        <LoadingOverlay visible={isLoading} />
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
          teamList={teamList}
          categoryList={categoryList}
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
                itemList={itemList}
                certificateList={certificateList}
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
              {!isNew && (
                <Button
                  type="button"
                  color="gray"
                  onClick={handleDeleteMatterInfo}
                >
                  削除
                </Button>
              )}
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
