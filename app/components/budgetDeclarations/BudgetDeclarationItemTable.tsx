"use client";

import { Alert, Table } from "@mantine/core";
import { useBudgetDeclarationDetail } from "@/app/hooks/useBudgetDeclarationData";
import { formatEntryType } from "@/app/utils/extraEntry";
import { formatCurrency } from "@/app/utils/formatter";
import { LoadingSpinner } from "../LoadingSpinner";

type Props = {
  declarationId: number;
};

// コメントは明細の有無に関わらず表示する（明細 0 件の申告でも DB 上は成立する）
const Comment = ({ comment }: { comment: string | null }) =>
  comment ? (
    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
      コメント: {comment}
    </p>
  ) : null;

// 一覧の行を開いたときに表示する明細（参照のみ）。
// 申告の作成・編集フォームは別 Issue（#87）で追加する。
const BudgetDeclarationItemTable = ({ declarationId }: Props) => {
  const {
    data: detail,
    isLoading,
    isError,
    error,
  } = useBudgetDeclarationDetail(declarationId);

  if (isError) {
    return (
      <Alert color="red" title="申告明細の取得に失敗しました">
        {error.message}
      </Alert>
    );
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // 申告そのものが見つからない（削除された / RLS で見えない）
  if (!detail) {
    return (
      <Alert color="gray" title="申告が見つかりません">
        別のユーザーが削除した可能性があります。ページを再読み込みしてください。
      </Alert>
    );
  }

  // ヘッダはあるが明細が 0 件。コメントだけが登録されている場合があるため表示する
  if (detail.items.length === 0) {
    return (
      <>
        <Alert color="gray" title="明細がありません">
          この申告には明細が登録されていません。
        </Alert>
        <Comment comment={detail.comment} />
      </>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>種別</Table.Th>
            <Table.Th>分類</Table.Th>
            <Table.Th>内容</Table.Th>
            <Table.Th className="text-right">金額</Table.Th>
            <Table.Th>担当者</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {detail.items.map((item) => (
            <Table.Tr key={item.id}>
              <Table.Td>{formatEntryType(item.entry_type)}</Table.Td>
              <Table.Td>{item.category}</Table.Td>
              <Table.Td>{item.description}</Table.Td>
              <Table.Td className="text-right">
                {formatCurrency(item.amount)}
              </Table.Td>
              <Table.Td>{item.managerName ?? "-"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Comment comment={detail.comment} />
    </div>
  );
};

export default BudgetDeclarationItemTable;
