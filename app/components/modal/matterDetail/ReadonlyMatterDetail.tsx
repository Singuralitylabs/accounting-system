"use client";

import { MatterInfoWithUserNameType } from "@/app/types/types";
import { Modal, Badge, Grid, LoadingOverlay } from "@mantine/core";
import LabelText from "../../LabelText";
import { formatCurrency, formatDateToJp } from "@/app/utils/formatter";
import { useMatterDetail } from "@/app/hooks/useMatterData";

type Props = {
  matterInfo: MatterInfoWithUserNameType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

export function ReadonlyMatterDetail({ matterInfo, opened, setOpened }: Props) {
  const { data, isLoading } = useMatterDetail(matterInfo.id, opened, {
    staleTime: 0,
    // QueryProvider が refetchOnMount: false のため、staleTime: 0 だけでは
    // キャッシュがある再マウントで再取得されない。開くたびに最新を取る。
    refetchOnMount: "always",
  });
  const businessList = data?.businesses ?? [];
  const costList = data?.costs ?? [];

  const getStatusBadge = () => {
    if (matterInfo.is_completed) {
      return <Badge color="green">経理確認完了</Badge>;
    } else if (matterInfo.is_fixed) {
      return <Badge color="red">経理申請中</Badge>;
    } else {
      return <Badge color="blue">下書き</Badge>;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => setOpened(false)}
      title={
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg">{matterInfo.title}</span>
        </div>
      }
      size="xl"
      overlayProps={{
        backgroundOpacity: 0.55,
        blur: 3,
      }}
    >
      <div className="relative">
        <LoadingOverlay visible={isLoading} />

        {/* ステータスバッジ */}
        <div className="flex justify-end w-full mb-4">{getStatusBadge()}</div>

        {/* 基本情報 */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 border-b pb-2">基本情報</h3>
          <Grid>
            <Grid.Col span={6}>
              <LabelText label="案件ID">#{matterInfo.id}</LabelText>
            </Grid.Col>
            <Grid.Col span={6}>
              <LabelText label="担当者">{matterInfo.user_name}</LabelText>
            </Grid.Col>
            <Grid.Col span={6}>
              <LabelText label="分類">{matterInfo.category}</LabelText>
            </Grid.Col>
            <Grid.Col span={6}>
              <LabelText label="チーム">{matterInfo.team}</LabelText>
            </Grid.Col>
            <Grid.Col span={6}>
              <LabelText label="案件開始日" isDate>
                {matterInfo.start_date}
              </LabelText>
            </Grid.Col>
            <Grid.Col span={12}>
              <LabelText label="説明">
                {matterInfo.description || "説明はありません"}
              </LabelText>
            </Grid.Col>
          </Grid>
        </div>

        {/* 取引先情報 */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 border-b pb-2">
            取引先情報 ({businessList.length}件)
          </h3>
          {businessList.length > 0 ? (
            <div className="space-y-3">
              {businessList.map((business) => (
                <div key={business.id} className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-600">
                        取引先名:
                      </span>
                      <div className="text-base">{business.name}</div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">
                        報酬額:
                      </span>
                      <div className="text-base font-bold text-green-600">
                        {formatCurrency(business.amount || 0)}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">
                        請求日:
                      </span>
                      <div className="text-base">
                        {business.invoice_date
                          ? formatDateToJp(business.invoice_date)
                          : "未設定"}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">
                        振込期限:
                      </span>
                      <div className="text-base">
                        {business.period_date
                          ? formatDateToJp(business.period_date)
                          : "未設定"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-center py-4">
              取引先情報が登録されていません
            </div>
          )}
        </div>

        {/* コスト情報 */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 border-b pb-2">
            コスト情報 ({costList.length}件)
          </h3>
          {costList.length > 0 ? (
            <div className="space-y-3">
              {costList.map((cost) => (
                <div key={cost.id} className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                      <span className="text-sm font-medium text-gray-600">
                        コスト名:
                      </span>
                      <div className="text-base">{cost.name}</div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">
                        金額:
                      </span>
                      <div className="text-base font-bold text-red-600">
                        {formatCurrency(cost.price)}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">
                        品目:
                      </span>
                      <div className="text-base">{cost.item}</div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">
                        支払い先:
                      </span>
                      <div className="text-base">{cost.payment_target}</div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">
                        支払い期限:
                      </span>
                      <div className="text-base">
                        {cost.period ? formatDateToJp(cost.period) : "未設定"}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">
                        通知方法:
                      </span>
                      <div className="text-base">{cost.certificate}</div>
                    </div>
                  </div>
                  {cost.withholding && (
                    <div className="text-sm text-orange-600 font-medium">
                      ※ 源泉徴収対象
                    </div>
                  )}
                  {cost.comment && (
                    <div className="mt-2">
                      <span className="text-sm font-medium text-gray-600">
                        コメント:
                      </span>
                      <div className="text-sm text-gray-700 mt-1">
                        {cost.comment}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-center py-4">
              コスト情報が登録されていません
            </div>
          )}
        </div>

        {/* 収支サマリー */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-3 border-b pb-2">
            収支サマリー
          </h3>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-sm font-medium text-gray-600">
                  合計請求額
                </div>
                <div className="text-xl font-bold text-green-600">
                  {formatCurrency(matterInfo.total_amount || 0)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-600">
                  合計コスト
                </div>
                <div className="text-xl font-bold text-red-600">
                  {formatCurrency(matterInfo.total_cost || 0)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-600">利益</div>
                <div
                  className={`text-xl font-bold ${
                    (matterInfo.total_amount || 0) -
                      (matterInfo.total_cost || 0) >=
                    0
                      ? "text-blue-600"
                      : "text-red-600"
                  }`}
                >
                  {formatCurrency(
                    (matterInfo.total_amount || 0) -
                      (matterInfo.total_cost || 0),
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 注意事項 */}
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="text-sm text-blue-700">
            <strong>ℹ️ チームリーダー権限</strong>
            <br />
            この画面は閲覧専用です。案件の編集や経理処理はできません。
          </div>
        </div>
      </div>
    </Modal>
  );
}
