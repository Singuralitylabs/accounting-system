import { Table } from "@mantine/core";
import FilterableTableHeader from "./FilterableTableHeader";
import { MatterInfoWithUserNameType } from "../types/types";

type Props = {
  matterList: MatterInfoWithUserNameType[];
  filters: Record<string, Set<string>>;
  setFilters: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
};

export const headerConfig = [
  { label: "ID", key: "id" },
  { label: "案件名", key: "title" },
  { label: "担当者", key: "user_name" },
  { label: "チーム", key: "team" },
  { label: "分類", key: "category" },
  { label: "合計請求額", key: "total_amount" },
  { label: "取引先数", key: "business_count" },
  { label: "合計コスト", key: "total_cost" },
  { label: "コスト数", key: "cost_count" },
  { label: "未払いコスト数", key: "unchecked_cost_count" },
];

const AccoutingTableHeader = ({ matterList, filters, setFilters }: Props) => {
  const getUniqueValues = (key: string) => {
    return Array.from(
      new Set(
        (matterList || [])
          .map((matter) => {
            const value = matter[key as keyof MatterInfoWithUserNameType];
            return value ? value.toString() : "";
          })
          .filter(Boolean),
      ),
    ).sort();
  };

  const handleFilterChange = (
    key: keyof MatterInfoWithUserNameType,
    values: Set<string>,
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: values,
    }));
  };

  return (
    <Table.Tr>
      <Table.Th></Table.Th>
      {headerConfig.map(({ label, key }) => (
        <FilterableTableHeader
          key={key}
          label={label}
          filterKey={key as keyof MatterInfoWithUserNameType}
          uniqueValues={getUniqueValues(key)}
          activeFilters={filters[key] || new Set()}
          onFilterChange={handleFilterChange}
        />
      ))}
      <Table.Th></Table.Th>
    </Table.Tr>
  );
};

export default AccoutingTableHeader;
