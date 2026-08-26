import { Table } from "@mantine/core";
import FilterableTableHeader from "./FilterableTableHeader";
import { MatterInfoWithUserNameType } from "../types/types";
import { MATTER_LIST_FILTER_COLUMNS } from "../utils/matterListFilters";

type Props = {
  matterList: MatterInfoWithUserNameType[];
  filters: Record<string, Set<string>>;
  setFilters: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
};

export const headerConfig = MATTER_LIST_FILTER_COLUMNS;

const AccountingTableHeader = ({ matterList, filters, setFilters }: Props) => {
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

export default AccountingTableHeader;
