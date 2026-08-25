import {
  BusinessInCardType,
  CostInCardType,
  MatterType,
} from "@/app/types/types";
import { Modal, Button, Group, Badge, LoadingOverlay } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState, useEffect } from "react";
import { CiSquarePlus } from "react-icons/ci";
import BusinessBlock from "../BusinessBlock";
import CostBlock from "../CostBlock";
import MatterInfoBlock from "../MatterInfoBlock";
import {
  useMatterDetail,
  useUpdateMatter,
  useCreateMatter,
  useDeleteMatter,
} from "@/app/hooks/useMatterData";

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
  // React Queryを使用してデータ取得
  const { data, isLoading, error } = useMatterDetail(
    matterInfo.id,
    opened && !isNew,
  );
  const updateMatterMutation = useUpdateMatter();
  const createMatterMutation = useCreateMatter();
  const deleteMatterMutation = useDeleteMatter();

  // React Queryから取得したデータを使用、新規作成時は空配列
  const [costInfoInCardList, setCostInfoInCardList] = useState<
    CostInCardType[]
  >([]);
  const [businessInfoInCardList, setBusinessInfoInCardList] = useState<
    BusinessInCardType[]
  >([]);

  // データが取得できた場合にstateを更新
  useEffect(() => {
    if (data && !isNew) {
      setCostInfoInCardList(data.costs);
      setBusinessInfoInCardList(data.businesses);
    } else if (isNew) {
      setCostInfoInCardList([]);
      setBusinessInfoInCardList([]);
    }
  }, [data, isNew]);

  // エラーハンドリング
  if (error && !isNew) {
    console.error("Error fetching matter details:", error);
  }

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
    const matterInfo: MatterType = {
      id: 0,
      title: form.getValues().title,
      category: form.getValues().category,
      team: form.getValues().team,
      start_date: form.getValues().start_date,
      description: form.getValues().description,
      is_fixed: isFixed,
      is_completed: false,
      has_updates: false,
      user_id: 1,
      accounting_memo: "",
      total_amount: 0,
      total_cost: 0,
      cost_count: costInfoInCardList.length,
      business_count: businessInfoInCardList.length,
      unchecked_cost_count: costInfoInCardList.length,
      parent_matter_id: null,
      inserted_at: "",
      updated_at: "",
    };

    try {
      await createMatterMutation.mutateAsync({
        matterInfo,
        businessInfoList: businessInfoInCardList.filter(
          (businessInfo) => !businessInfo.isRemoved,
        ),
        costInfoList: costInfoInCardList.filter(
          (costInfo) => !costInfo.isRemoved,
        ),
      });
      form.reset();
      closeModal();
    } catch (error) {
      console.error("案件作成に失敗しました:", error);
    }
  };

  const handleUpdateMatterInfo = async (isFixed: boolean) => {
    // 経理申請後の更新かどうかを判定
    const isPostSubmissionUpdate = matterInfo.is_fixed && isFixed;

    const updatedMatterInfo: MatterType = {
      ...matterInfo,
      title: form.values.title,
      category: form.values.category,
      team: form.values.team,
      start_date: form.values.start_date,
      description: form.values.description,
      is_fixed: isFixed,
      has_updates: isPostSubmissionUpdate ? true : matterInfo.has_updates, // 経理申請後の更新ならtrue
    };

    try {
      await updateMatterMutation.mutateAsync({
        matterInfo: updatedMatterInfo,
        businessInfoList: businessInfoInCardList,
        costInfoList: costInfoInCardList,
      });
      closeModal();
    } catch (error) {
      console.error("案件更新に失敗しました:", error);
    }
  };

  const handleDeleteMatterInfo = async () => {
    try {
      await deleteMatterMutation.mutateAsync(matterInfo);
      closeModal();
    } catch (error) {
      console.error("案件削除に失敗しました:", error);
    }
  };

  const handleAddCost = () => {
    const newId =
      costInfoInCardList.length === 0
        ? 1
        : Math.max(...costInfoInCardList.map((cost) => cost.id)) + 1;
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
      businessInfoInCardList.length === 0
        ? 1
        : Math.max(...businessInfoInCardList.map((business) => business.id)) +
          1;
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
      }),
    );
  };

  const handleRemoveBusiness = (id: number) => {
    setBusinessInfoInCardList(
      businessInfoInCardList.map((businessInfo) => {
        if (businessInfo.id === id) businessInfo.isRemoved = true;
        return businessInfo;
      }),
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
        onSubmit={form.onSubmit(() =>
          handleUpdateMatterInfo(matterInfo.is_fixed || false),
        )}
      >
        <LoadingOverlay
          visible={
            isLoading ||
            updateMatterMutation.isPending ||
            createMatterMutation.isPending ||
            deleteMatterMutation.isPending
          }
        />
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
                        : businessVal,
                    ),
                  );
                }}
              />
            ),
        )}
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

        <h2 className="mt-8 mb-4">コスト情報</h2>
        {costInfoInCardList.map(
          (costInfo, index) =>
            !costInfo.isRemoved && (
              <CostBlock
                key={costInfo.id}
                variant="user"
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
                      costVal.id === updatedCost.id ? updatedCost : costVal,
                    ),
                  );
                }}
              />
            ),
        )}
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

        <div className="flex justify-between mt-6">
          <Group justify="flex-end" mt="md">
            {!isNew && !matterInfo.is_fixed && (
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
              <>
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
                <Button
                  type="button"
                  color="red"
                  onClick={() => {
                    const validation = form.validate();
                    if (validation.hasErrors) {
                      return;
                    }
                    handleAddMatterInfo(true);
                  }}
                >
                  経理申請
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="submit"
                  color={matterInfo.is_fixed ? "red" : undefined}
                >
                  更新
                </Button>
                {!matterInfo.is_fixed && (
                  <Button
                    type="button"
                    color="red"
                    onClick={() => {
                      const validation = form.validate();
                      if (validation.hasErrors) {
                        return;
                      }
                      handleUpdateMatterInfo(true);
                    }}
                  >
                    経理申請
                  </Button>
                )}
              </>
            )}
          </Group>
        </div>
      </form>
    </Modal>
  );
};
