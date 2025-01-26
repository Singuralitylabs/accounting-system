import {
  BusinessType,
  CostType,
  MatterInfoWithUserNameType,
} from "@/app/types/types";
import { formatCurrency, formatDateToJp } from "@/app/utils/formatter";
import {
  getUserBusinessInfoList,
  getUserCostInfoList,
  updateBusinessInfo,
  updateCostInfo,
  updateMatterInfo,
} from "@/app/utils/supabase/supabaseServer";
import {
  Modal,
  Group,
  Card,
  Badge,
  Text,
  Stack,
  Grid,
  Checkbox,
  Button,
  Textarea,
  LoadingOverlay,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type LabelTextPropsType = {
  label: string;
  children: React.ReactNode;
  isCurrency?: boolean;
  isDate?: boolean;
};

const LabelText = ({
  label,
  children,
  isCurrency = false,
  isDate = false,
}: LabelTextPropsType) => {
  const value =
    typeof children === "number" && isCurrency
      ? formatCurrency(children)
      : typeof children === "string" && isDate
      ? formatDateToJp(children)
      : isCurrency && isDate
      ? "-"
      : children;
  return (
    <Stack gap="xs" className="w-full md:pt-0 pt-4">
      <Text size="sm" fw={500} c="dimmed">
        {label}
      </Text>
      {value && <Text className="p-4">{value}</Text>}
    </Stack>
  );
};

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
      updatedMatter.unchecked_cost_count = costList.filter(
        (cost) => !cost.is_completed
      ).length;
      updatedMatter.accounting_memo = accountingMemo;

      await updateMatterInfo(updatedMatter);

      for (const business of businessList) {
        if (business) {
          await updateBusinessInfo(
            business.id,
            business.name,
            business.amount!,
            business.invoice_date!,
            business.period_date!,
            business.matter_id,
            business.is_completed
          );
        }
      }
      for (const cost of costList) {
        if (cost) {
          await updateCostInfo(
            cost.id,
            cost.name,
            cost.item,
            cost.payment_target,
            cost.price,
            cost.period!,
            cost.certificate,
            cost.withholding,
            cost.matter_id,
            cost.comment!,
            cost.is_completed
          );
        }
      }
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
              <Card
                key={business.id}
                className="items-center mb-2 relative"
                withBorder
                radius="sm"
                padding="sm"
                aria-label="コスト"
                bg="green.0"
              >
                <div className="flex gap-2 items-center absolute top-2 right-2">
                  <Checkbox
                    aria-label="受取済み"
                    checked={business.is_completed}
                    disabled={matterInfo.is_completed!}
                    onChange={(event) =>
                      setBusinessList(
                        businessList.map((businessInfo) => {
                          return businessInfo.id === business.id
                            ? {
                                ...business,
                                is_completed: event.currentTarget.checked,
                              }
                            : businessInfo;
                        })
                      )
                    }
                  />
                  <span>確認完了</span>
                </div>

                <div className="flex-grow flex pb-2 pt-8">
                  <Group gap="sm" className="flex-grow w-full">
                    <Stack gap="xs" className="flex-grow">
                      <Text size="sm" fw={500} c="dimmed">
                        取引先名
                      </Text>
                      <Text>{business.name}</Text>
                    </Stack>
                    <Stack gap="xs" className="flex-grow">
                      <Text size="sm" fw={500} c="dimmed">
                        請求額
                      </Text>
                      <Text>{formatCurrency(business.amount)}</Text>
                    </Stack>
                    <Stack gap="xs" className="flex-grow">
                      <Text size="sm" fw={500} c="dimmed">
                        請求日
                      </Text>
                      <Text>{formatDateToJp(business.invoice_date)}</Text>
                    </Stack>
                    <Stack gap="xs" className="flex-grow">
                      <Text size="sm" fw={500} c="dimmed">
                        振込期限
                      </Text>
                      <Text>{formatDateToJp(business.period_date)}</Text>
                    </Stack>
                  </Group>
                </div>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
        {costList.length > 0 ? <h2 className="my-4">コスト情報</h2> : ""}
        <Grid gutter="md">
          {costList?.map((cost) => (
            <Grid.Col key={cost.id} span={{ base: 12, md: 6, lg: 4 }}>
              <Card
                key={cost.id}
                className="mb-4 relative"
                withBorder
                radius="sm"
                padding="sm"
                aria-label="コスト"
                bg="gray.0"
              >
                <div className="flex gap-2 items-center absolute top-2 right-2">
                  <Checkbox
                    aria-label="支払い済み"
                    checked={cost.is_completed}
                    disabled={matterInfo.is_completed!}
                    onChange={(event) =>
                      setCostList(
                        costList.map((costInfo) => {
                          return costInfo.id === cost.id
                            ? {
                                ...cost,
                                is_completed: event.currentTarget.checked,
                              }
                            : costInfo;
                        })
                      )
                    }
                  />
                  <span>支払い完了</span>
                </div>

                <div className="flex-grow pt-8">
                  <div className="flex pb-2">
                    <Group gap="sm" className="flex-grow w-full">
                      <Stack gap="xs" className="flex-grow">
                        <Text size="sm" fw={500} c="dimmed">
                          コスト名
                        </Text>
                        <Text>{cost.name}</Text>
                      </Stack>
                      <Stack gap="xs" className="flex-grow">
                        <Text size="sm" fw={500} c="dimmed">
                          品目
                        </Text>
                        <Text>{cost.item}</Text>
                      </Stack>
                      <Stack gap="xs" className="flex-grow">
                        <Text size="sm" fw={500} c="dimmed">
                          価格
                        </Text>
                        <Text>{formatCurrency(cost.price)}</Text>
                      </Stack>
                    </Group>
                  </div>
                  <div className="items-center pb-2">
                    <Group gap="sm" className="flex-grow">
                      <Stack gap="xs" className="flex-grow">
                        <Text size="sm" fw={500} c="dimmed">
                          支払い期限
                        </Text>
                        <Text>{formatDateToJp(cost.period)}</Text>
                      </Stack>
                      <Stack gap="xs" className="flex-grow">
                        <Text size="sm" fw={500} c="dimmed">
                          支払い先
                        </Text>
                        <Text>{cost.payment_target}</Text>
                      </Stack>
                      <Stack gap="xs" className="flex-grow">
                        <Text size="sm" fw={500} c="dimmed">
                          申請方法
                        </Text>
                        <Text>{cost.certificate}</Text>
                      </Stack>
                      <Stack gap="xs" className="flex-grow">
                        <Text size="sm" fw={500} c="dimmed">
                          源泉徴収
                        </Text>
                        <Text>{cost.withholding ? "あり" : "なし"}</Text>
                      </Stack>
                    </Group>
                  </div>
                </div>
              </Card>
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
        {!matterInfo.is_completed ? (
          <div className="my-4 w-full">
            <Button
              fullWidth
              color="green"
              className="w-full"
              onClick={handleCheckMatterInfo}
            >
              保存
            </Button>
          </div>
        ) : (
          <div className="my-4 w-full">
            <Button
              fullWidth
              color="red"
              className="w-full"
              onClick={handleRevertMatterInfo}
            >
              申請中に戻す
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
