import { Table } from "@mantine/core";
import { MatterInfoWithUserNameType } from "../types/types";
import AccountingCheckbox from "./buttons/accounting-checkbox";
import TableInfo from "./TableInfo";
import { headerConfig } from "./AccoutingTableHeader";

type Props = {
  matter: MatterInfoWithUserNameType;
  isChecked: boolean;
  checkedMatterIdList: number[];
  setCheckedMatterIdList: (matterIdList: number[]) => void;
  onShowMatterInfo: (matter: MatterInfoWithUserNameType) => void;
};

const AccountingTablebody = ({
  matter,
  isChecked,
  checkedMatterIdList,
  setCheckedMatterIdList,
  onShowMatterInfo,
}: Props) => {
  return (
    <Table.Tr
      key={matter.id}
      bg={
        isChecked
          ? "var(--mantine-color-red-5)"
          : matter.is_completed
          ? "var(--mantine-color-green-light)"
          : matter.is_fixed
          ? "var(--mantine-color-red-light)"
          : "var(--mantine-color-blue-light)"
      }
    >
      <Table.Td>
        <AccountingCheckbox
          id={matter.id}
          isCompleted={matter.is_completed!}
          matterIdList={checkedMatterIdList}
          setMatterIdList={setCheckedMatterIdList}
        />
      </Table.Td>
      <TableInfo
        matter={matter}
        username={matter.user_name!}
        itemList={headerConfig.map((config) => config.label)}
      />
      <Table.Td className="whitespace-nowrap px-4">
        <button
          onClick={() => onShowMatterInfo(matter)}
          className="bg-gray-700 hover:bg-gray-500 px-2 rounded text-white"
        >
          詳細
        </button>
      </Table.Td>
    </Table.Tr>
  );
};

export default AccountingTablebody;
