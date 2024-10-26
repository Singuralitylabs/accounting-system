"use client";

import { Table } from "@mantine/core";
import { elementListInDashboard } from "../types/params";
import { MatterType } from "../types/types";

export const DashboardMatterList = ({
  matterList,
}: {
  matterList: MatterType[] | null;
}) => {
  const tableHeads = (
    <Table.Tr key={elementListInDashboard[0]}>
      {elementListInDashboard.map((element) => (
        <Table.Th>{element}</Table.Th>
      ))}
    </Table.Tr>
  );
  const tableInfoList = matterList?.map((matter) => (
    <Table.Tr key={matter.id}>
      <Table.Td>{matter.id}</Table.Td>
      <Table.Td>{matter.title}</Table.Td>
      <Table.Td>{matter.user_id}</Table.Td>
      <Table.Td>{matter.team}</Table.Td>
      <Table.Td>{matter.category}</Table.Td>
      <Table.Td>{matter.billing_address}</Table.Td>
      <Table.Td>{matter.amount}</Table.Td>
      <Table.Td>{matter.start_date}</Table.Td>
      <Table.Td>{matter.invoice_date}</Table.Td>
      <Table.Td>{matter.period_date}</Table.Td>
    </Table.Tr>
  ));

  return (
    <Table>
      <Table.Thead>{tableHeads}</Table.Thead>
      <Table.Tbody>{tableInfoList}</Table.Tbody>
    </Table>
  );
};
