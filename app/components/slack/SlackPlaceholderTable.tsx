import { Code, Table } from "@mantine/core";
import type { SlackPlaceholder } from "@/app/utils/slackTemplate";

type Props = {
  placeholders: readonly SlackPlaceholder[];
  requiredKeys?: readonly string[];
};

// Placeholder reference shown once per settings screen, shared by the matter notice and the budget
// declaration reminder settings so both look the same.
export const SlackPlaceholderTable = ({
  placeholders,
  requiredKeys = [],
}: Props) => (
  <Table withTableBorder fz="xs" data-testid="slack-placeholder-table">
    <Table.Thead>
      <Table.Tr>
        <Table.Th>プレースホルダ</Table.Th>
        <Table.Th>意味</Table.Th>
        <Table.Th>例</Table.Th>
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {placeholders.map(({ key, description, sample }) => (
        <Table.Tr key={key}>
          <Table.Td>
            <Code>{`{${key}}`}</Code>
          </Table.Td>
          <Table.Td>
            {description}
            {requiredKeys.includes(key) && "（必須）"}
          </Table.Td>
          <Table.Td>{sample}</Table.Td>
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
);
