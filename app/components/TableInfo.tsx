import { MatterType } from "../types/types";
import { Table } from "@mantine/core";

type Props = {
  matter: MatterType;
  username?: string;
  itemList: string[];
};

const matterInfoTable: { [key: string]: keyof MatterType | "username" } = {
  ID: "id",
  案件名: "title",
  担当者: "username",
  チーム: "team",
  分類: "category",
  合計請求額: "total_amount",
  取引先数: "business_count",
  合計コスト: "total_cost",
  コスト数: "cost_count",
  未払いコスト数: "unchecked_cost_count",
};

const TableInfo = ({ matter, username, itemList }: Props) => {
  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "-";
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatValue = (key: string, value: any) => {
    if (key === "案件名" && typeof value === "string") {
      return value.length > 15 ? `${value.slice(0, 15)}...` : value;
    }
    if (key === "合計請求額" || key === "合計コスト") {
      return formatCurrency(value);
    }
    return value;
  };

  return (
    <>
      {itemList.map((item) => {
        const key = matterInfoTable[item];
        if (!key) return <Table.Td>取得エラー</Table.Td>;

        const value = key === "username" ? username : matter[key];
        const formattedValue = formatValue(item, value);

        return (
          <Table.Td
            key={item}
            className={`whitespace-nowrap px-4 ${
              typeof value === "number" ? "text-right" : ""
            } ${
              key === "unchecked_cost_count" &&
              typeof value === "number" &&
              value > 0
                ? "text-red-600 font-bold"
                : ""
            }`}
            title={item === "案件名" ? matter.title : undefined}
          >
            {formattedValue}
          </Table.Td>
        );
      })}
    </>
  );
};

export default TableInfo;
