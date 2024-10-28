import { CostType, MatterType } from "@/app/types/types";
import { getUserCostInfoList } from "@/app/utils/supabaseServer";
import { Modal, Group, Card, Badge, Text, Stack, Grid } from "@mantine/core";
import { useEffect, useState } from "react";

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: string | null) => {
  if (!date) return "-";
  try {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  } catch {
    return "-";
  }
};

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
      ? formatDate(children)
      : isCurrency && isDate
      ? "-"
      : children;
  return (
    <Stack gap="xs" className="w-full md:pt-0 pt-4">
      <Text size="sm" fw={500} c="dimmed">
        {label}
      </Text>
      {value ? <Text className="border p-4 rounded">{value}</Text> : ""}
    </Stack>
  );
};

type Props = {
  matterInfo: MatterType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

export const MatterCardDetailModalForAccounting = ({
  matterInfo,
  opened,
  setOpened,
}: Props) => {
  const [costInfoInCardList, setCostInfoInCardList] = useState<CostType[]>([]);
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
          setCostInfoInCardList(costInfoList);
        }
      };
      getCostInfo();
    }
  }, [opened, matterInfo.id]);

  const closeModal = () => {
    setOpened(false);
  };

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title={matterInfo.title}
      size="100%"
    >
      <div>
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
          <LabelText label="案件名">{matterInfo.title}</LabelText>
          <LabelText label="取引先">{matterInfo.billing_address}</LabelText>
        </div>
        <div className="sm:flex gap-4 w-full my-4">
          <LabelText label="分類">{matterInfo.category}</LabelText>
          <LabelText label="チーム">{matterInfo.team}</LabelText>
          <LabelText label="請求額" isCurrency>
            {matterInfo.amount}
          </LabelText>
        </div>
        <div className="sm:flex gap-4 w-full">
          <LabelText label="案件開始日" isDate>
            {matterInfo.start_date}
          </LabelText>
          <LabelText label="請求日" isDate>
            {matterInfo.invoice_date}
          </LabelText>
          <LabelText label="振込期限" isDate>
            {matterInfo.period_date}
          </LabelText>
        </div>
        <div className="w-full my-4">
          <LabelText label="説明">{matterInfo.description}</LabelText>
        </div>

        {costInfoInCardList.length > 0 ? (
          <h2 className="my-4">コスト情報</h2>
        ) : (
          ""
        )}
        <Grid gutter="md">
          {costInfoInCardList?.map((cost) => (
            <Grid.Col key={cost.id} span={{ base: 12, md: 6, lg: 4 }}>
              <Card
                key={cost.id}
                className="sm:flex items-center mb-4"
                withBorder
                radius="sm"
                padding="lg"
                aria-label="コスト"
                bg="gray.0"
              >
                <div className="flex-grow">
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
                  <div className="sm:flex flex-col sm:flex-row items-center pb-2">
                    <Group gap="sm" className="flex-grow">
                      <Stack gap="xs" className="flex-grow">
                        <Text size="sm" fw={500} c="dimmed">
                          支払い期限
                        </Text>
                        <Text>{formatDate(cost.period)}</Text>
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
                  <div className="flex items-center pb-2">
                    <Stack gap="xs" className="flex-grow">
                      <Text size="sm" fw={500} c="dimmed">
                        コメント
                      </Text>
                      <Text>{cost.comment}</Text>
                    </Stack>
                  </div>
                </div>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      </div>
    </Modal>
  );
};
