import { Table, TextInput } from "@mantine/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SelectOptionType } from "../types/types";
import { MdDragIndicator } from "react-icons/md";
import { FaRegTrashAlt } from "react-icons/fa";

interface Props {
  option: Pick<
    SelectOptionType,
    "id" | "value" | "display_order" | "is_active"
  >;
  onUpdate: (
    id: number,
    updates: { value: string } | { is_active: boolean },
  ) => void;
  onRemove: (id: number) => void;
}

export function SortableTableRow({ option, onUpdate, onRemove }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Table.Tr ref={setNodeRef} style={style}>
      <Table.Td className="w-8">
        <div {...attributes} {...listeners} className="cursor-move">
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
        />
      </Table.Td>
      <Table.Td>
        <button
          className="text-lg hover:cursor-pointer w-4 flex items-center justify-center hover:text-blue-500 h-[38px]"
          onClick={() => onRemove(option.id)}
        >
          <FaRegTrashAlt />
        </button>
      </Table.Td>
    </Table.Tr>
  );
}
