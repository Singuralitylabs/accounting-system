"use client";

import {
  BusinessType,
  CostType,
  MatterInfoWithUserNameType,
} from "@/app/types/types";
import {
  Modal,
  Badge,
  Grid,
  Button,
  Textarea,
  LoadingOverlay,
  Checkbox,
} from "@mantine/core";
import { useEffect, useState } from "react";
import LabelText from "../../LabelText";
import BusinessBlock from "../../BusinessBlock";
import CostBlock from "../../CostBlock";
import {
  useMatterDetail,
  useRevertToFixed,
  useRevertToDraft,
  useCheckCompletedSingle,
  useSaveAccountingMemo,
} from "@/app/hooks/useMatterData";

type Props = {
  matterInfo: MatterInfoWithUserNameType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

export function AccountingMatterDetail({
  matterInfo,
  opened,
  setOpened,
}: Props) {
  const [costList, setCostList] = useState<CostType[]>([]);
  const [businessList, setBusinessList] = useState<BusinessType[]>([]);
  const [checkhasUpdates, setCheckhasUpdates] = useState<boolean>(false);
  const [accountingMemo, setAccountingMemo] = useState<string | null>("");

  // React Queryを使用してデータ取得
  const { data, isLoading, error, refetch } = useMatterDetail(
    matterInfo.id,
    opened,
  );
  const revertToFixedMutation = useRevertToFixed();
  const revertToDraftMutation = useRevertToDraft();
  const checkCompletedSingleMutation = useCheckCompletedSingle();
  const saveAccountingMemoMutation = useSaveAccountingMemo();

  // データマッピング用の共通関数
  const updateStateFromData = (
    responseData: { costs: CostType[]; businesses: BusinessType[] } | undefined,
  ) => {
    if (responseData) {
      setCostList(
        responseData.costs.map((cost) => ({
          ...cost,
          isNew: false,
          isRemoved: false,
        })),
      );
      setBusinessList(
        responseData.businesses.map((business) => ({
          ...business,
          isNew: false,
          isRemoved: false,
        })),
      );
    }
  };

  // データが取得できた場合にstateを更新
  useEffect(() => {
    updateStateFromData(data);
  }, [data]);

  // 初期値設定
  useEffect(() => {
    setCheckhasUpdates(matterInfo.has_updates || false);
    setAccountingMemo(matterInfo.accounting_memo || "");
  }, [matterInfo.has_updates, matterInfo.accounting_memo]);

  const closeModal = () => {
    setOpened(false);
  };

  const handleSaveMatterInfo = async () => {
    const isUpdated = window.confirm(`保存しますか？`);

    if (!isUpdated) {
      return;
    }

    try {
      await saveAccountingMemoMutation.mutateAsync({
        matterInfo,
        businessList,
        costList,
        accountingMemo: accountingMemo || undefined,
        clearHasUpdates: checkhasUpdates,
      });

      // データを再取得してstateを更新
      const updatedData = await refetch();
      updateStateFromData(updatedData.data);

      closeModal();
    } catch (error) {
      console.error("保存に失敗しました:", error);
      alert("保存に失敗しました。");
    }
  };

  const handleCheckCompleted = async () => {
    const isCompleted = window.confirm(`確認完了しますか？`);

    if (!isCompleted) {
      return;
    }

    try {
      await checkCompletedSingleMutation.mutateAsync({
        matterInfo,
        businessList,
        costList,
        accountingMemo: accountingMemo || undefined,
        clearHasUpdates: checkhasUpdates,
      });
      closeModal();
    } catch (error) {
      console.error("確認完了に失敗しました:", error);
      alert("確認完了に失敗しました。");
    }
  };

  const handleBackToFixedMatter = async () => {
    const isRevert = window.confirm(`申請中に戻しますか？`);

    if (!isRevert) {
      return;
    }

    try {
      await revertToFixedMutation.mutateAsync({
        matterInfo,
        accountingMemo: accountingMemo || undefined,
        clearHasUpdates: false,
      });
      closeModal();
    } catch (error) {
      console.error("申請中に戻すのに失敗しました:", error);
      alert("申請中に戻すのに失敗しました。");
    }
  };

  const handleBackToDraft = async () => {
    const isRevert = window.confirm(`下書きに戻しますか？`);

    if (!isRevert) {
      return;
    }

    try {
      await revertToDraftMutation.mutateAsync({
        matterInfo,
        accountingMemo: accountingMemo || undefined,
        clearHasUpdates: false,
      });
      closeModal();
    } catch (error) {
      console.error("下書きに戻すのに失敗しました:", error);
      alert("下書きに戻すのに失敗しました。");
    }
  };

  if (error) {
    return (
      <Modal opened={opened} onClose={closeModal} title="エラー">
        <div>データの取得に失敗しました。</div>
      </Modal>
    );
  }

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title={matterInfo.title}
      size="100%"
    >
      <LoadingOverlay
        visible={
          isLoading ||
          revertToFixedMutation.isPending ||
          revertToDraftMutation.isPending ||
          checkCompletedSingleMutation.isPending ||
          saveAccountingMemoMutation.isPending
        }
      />
      <div className="flex justify-end">
        {matterInfo.is_completed ? (
          <Badge color="green">経理確認完了</Badge>
        ) : matterInfo.is_fixed ? (
          <Badge color="red">経理申請中</Badge>
        ) : (
          <Badge color="blue">下書き</Badge>
        )}
      </div>
      <span className="text-red-700 text-sm">
        ※記載の金額は、全て税抜となっております。
      </span>
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
            <BusinessBlock
              variant="accounting"
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
            <CostBlock
              variant="accounting"
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
        value={accountingMemo || ""}
        disabled={matterInfo.is_completed!}
        onChange={(event) => setAccountingMemo(event.currentTarget.value)}
      />
      <div className="flex justify-end items-center gap-2">
        {matterInfo.has_updates && (
          <Checkbox
            label="更新確認"
            color="orange"
            size="sm"
            checked={checkhasUpdates}
            onChange={(event) =>
              setCheckhasUpdates(event.currentTarget.checked)
            }
          />
        )}
      </div>
      <div className="my-4">
        {!matterInfo.is_completed ? (
          <div className="flex gap-2">
            <Button fullWidth color="indigo" onClick={handleSaveMatterInfo}>
              保存
            </Button>
            {matterInfo.is_fixed && (
              <Button fullWidth color="blue" onClick={handleBackToDraft}>
                下書きに戻す
              </Button>
            )}
            {matterInfo.is_fixed && (
              <Button fullWidth color="green" onClick={handleCheckCompleted}>
                確認完了
              </Button>
            )}
          </div>
        ) : (
          <Button fullWidth color="red" onClick={handleBackToFixedMatter}>
            経理申請中に戻す
          </Button>
        )}
      </div>
    </Modal>
  );
}
