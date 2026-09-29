import { ActionIcon, Table, TextInput } from "@mantine/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SelectOptionType } from "../types/types";
import { MdDragIndicator } from "react-icons/md";
import { FaRegTrashAlt } from "react-icons/fa";

export type OptionRowStatus = "changed" | "added";

interface Props {
  option: Pick<
    SelectOptionType,
    "id" | "value" | "display_order" | "is_active"
  >;
  label: string;
  // 1-based position among displayed rows: shown from md up, and always in screen-reader labels so rows can be told apart.
  rowNumber: number;
  status?: OptionRowStatus;
  error?: string;
  disabled?: boolean;
  onUpdate: (
    id: number,
    updates: { value: string } | { is_active: boolean },
  ) => void;
  onRemove: (id: number) => void;
}

const STATUS_BACKGROUND: Record<OptionRowStatus, string> = {
  changed: "var(--mantine-color-orange-0)",
  added: "var(--mantine-color-green-0)",
};

export function SortableTableRow({
  option,
  label,
  rowNumber,
  status,
  error,
  disabled,
  onUpdate,
  onRemove,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option.id });

  const rowName = option.value || `新しい${label}`;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: status ? STATUS_BACKGROUND[status] : undefined,
  };

  return (
    <Table.Tr ref={setNodeRef} style={style}>
      <Table.Td className="hidden w-10 text-center text-gray-500 md:table-cell">
        {rowNumber}
      </Table.Td>
      <Table.Td className="w-8">
        <div
          {...attributes}
          {...listeners}
          aria-label={`${rowName}（${rowNumber}行目）の並び順を変更`}
          title="ドラッグして並び替え"
          className="cursor-move"
        >
          <MdDragIndicator size={20} />
        </div>
      </Table.Td>
      <Table.Td>
        <TextInput
          value={option.value || ""}
          onChange={(e) =>
            onUpdate(option.id, {
              value: e.currentTarget.value,
            })
          }
          size="sm"
          aria-label={`${label}の項目名（${rowNumber}行目）`}
          placeholder={`${label}の項目名を入力`}
          error={error}
          disabled={disabled}
        />
      </Table.Td>
      <Table.Td className="w-12 align-top">
        <ActionIcon
          type="button"
          color="red"
          variant="subtle"
          size={36}
          aria-label={`${rowName}（${rowNumber}行目）を削除`}
          onClick={() => onRemove(option.id)}
          disabled={disabled}
        >
          <FaRegTrashAlt />
        </ActionIcon>
      </Table.Td>
    </Table.Tr>
  );
}
