import {
  BusinessType,
  CostType,
  MatterInfoWithUserNameType,
} from "@/app/types/types";
import {
  getUserBusinessInfoList,
  getUserCostInfoList,
  updateMatterInfo,
} from "@/app/utils/supabase/supabaseServer";
import {
  Modal,
  Badge,
  Grid,
  Button,
  Textarea,
  LoadingOverlay,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import LabelText from "../LabelText";
import BusinessBlockForAccounting from "../BusinessBlockForAccounting";
import CostBlockForAccounting from "../CostBlockForAccounting";
import { updateMatter } from "@/app/utils/supabase/editMatterInfo";

type Props = {
  matterInfo: MatterInfoWithUserNameType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

export const MatterCardDetailModalForAccounting = ({
  matterInfo,
  opened,
  setOpened,
}: Props) => {
  const [costList, setCostList] = useState<CostType[]>([]);
  const [businessList, setBusinessList] = useState<BusinessType[]>([]);
  const [accountingMemo, setAccountingMemo] = useState<string | null>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const router = useRouter();
  const [_, startTransition] = useTransition();

  useEffect(() => {
    if (opened) {
      const getBusinessInfo = async () => {
        const { businessInfoList, error } = await getUserBusinessInfoList(
          matterInfo.id
        );

        if (error) {
          console.error("Error fetching businessInfoList:", error);
          return <div>取引先情報の取得に失敗しました。</div>;
        }
        if (businessInfoList) {
          setBusinessList(businessInfoList);
        }
      };
      getBusinessInfo();

      const getCostInfo = async () => {
        const { costInfoList, error } = await getUserCostInfoList(
          matterInfo.id
        );

        if (error) {
          console.error("Error fetching costInfoList:", error);
          return <div>コスト情報の取得に失敗しました。</div>;
        }
        if (costInfoList) {
          setCostList(costInfoList);
        }
      };
      getCostInfo();
    }
  }, [opened, matterInfo.id]);

  const closeModal = () => {
    refreshData();
    setOpened(false);
  };

  const refreshData = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleCheckMatterInfo = async () => {
    const isUpdated = window.confirm(`保存しますか？`);
    if (!isUpdated) {
      alert("保存処理を中止しました。");
      return;
    }

    try {
      setIsLoading(true);
      let { user_name, slack_id, ...updatedMatter } = matterInfo;
      updatedMatter.accounting_memo = accountingMemo;

      await updateMatter(
        updatedMatter,
        businessList.map((business) => ({
          ...business,
          isNew: false,
          isRemoved: false,
        })),
        costList.map((cost) => ({ ...cost, isNew: false, isRemoved: false }))
      );

      setIsLoading(false);
      closeModal();
    } catch (err) {
      console.error("Error updating matterInfo:", err);
      alert("保存処理に失敗しました。");
      return;
    }
  };

  const handleRevertMatterInfo = async () => {
    const isReverted = window.confirm(`経理申請中に戻しますか？`);
    if (!isReverted) {
      alert("経理申請中に戻す処理を中止しました。");
      return;
    }

    try {
      setIsLoading(true);
      let { user_name, slack_id, ...updatedMatter } = matterInfo;
      updatedMatter.is_completed = false;

      await updateMatterInfo(updatedMatter);
      alert(`${updatedMatter.title}を経理申請中に戻しました。`);
      setIsLoading(false);
      closeModal();
    } catch (err) {
      console.error("Error updating matterInfo:", err);
      alert("経理申請中に戻す処理に失敗しました。");
      return;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title={matterInfo.title}
      size="100%"
    >
      <div className="w-full">
        <LoadingOverlay visible={isLoading} />
        <div className="flex justify-end">
          {matterInfo.is_completed ? (
            <Badge color="green">経理確認完了</Badge>
          ) : matterInfo.is_fixed ? (
            <Badge color="blue">経理確認待ち</Badge>
          ) : (
            <Badge color="red">申請者編集中</Badge>
          )}
        </div>
        <h2 className="my-4">基本情報</h2>
        <div className="sm:flex gap-4 w-full my-4">
          <LabelText label="担当者名">{matterInfo.user_name}</LabelText>
          <LabelText label="分類">{matterInfo.category}</LabelText>
          <LabelText label="チーム">{matterInfo.team}</LabelText>
          <LabelText label="案件開始日" isDate>
            {matterInfo.start_date}
          </LabelText>
        </div>
        <div className="w-full my-4">
          <LabelText label="説明">{matterInfo.description}</LabelText>
        </div>

        {businessList.length > 0 ? <h2 className="my-4">取引先情報</h2> : ""}
        <Grid gutter="md">
          {businessList?.map((business) => (
            <Grid.Col key={business.id} span={{ base: 12, md: 6, lg: 4 }}>
              <BusinessBlockForAccounting
                business={business}
                businessList={businessList}
                setBusinessList={setBusinessList}
                isCompleted={matterInfo.is_completed!}
              />
            </Grid.Col>
          ))}
        </Grid>
        {costList.length > 0 ? <h2 className="my-4">コスト情報</h2> : ""}
        <Grid gutter="md">
          {costList?.map((cost) => (
            <Grid.Col key={cost.id} span={{ base: 12, md: 6, lg: 4 }}>
              <CostBlockForAccounting
                cost={cost}
                costList={costList}
                setCostList={setCostList}
                isCompleted={matterInfo.is_completed!}
              />
            </Grid.Col>
          ))}
        </Grid>
        <Textarea
          label="経理メモ"
          className="pt-4 w-full"
          defaultValue={
            matterInfo.accounting_memo ? matterInfo.accounting_memo : ""
          }
          disabled={matterInfo.is_completed!}
          onChange={(event) => setAccountingMemo(event.currentTarget.value)}
        />
        <div className="my-4">
          {!matterInfo.is_completed ? (
            <Button
              fullWidth
              color="green"
              className="w-full"
              onClick={handleCheckMatterInfo}
            >
              保存
            </Button>
          ) : (
            <Button
              fullWidth
              color="red"
              className="w-full"
              onClick={handleRevertMatterInfo}
            >
              申請中に戻す
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
