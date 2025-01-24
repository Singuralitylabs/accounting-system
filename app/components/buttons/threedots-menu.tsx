import { MatterType } from "@/app/types/types";
import { ActionIcon, Menu } from "@mantine/core";
import { BsThreeDotsVertical } from "react-icons/bs";

type Props = {
  matter: MatterType;
  onCopy: (matter: MatterType) => void;
  onDelete: (matter: MatterType) => void;
};
const ThreedotsMenu = ({ matter, onCopy, onDelete }: Props) => {
  return (
    <Menu position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon variant="transparent" size="sm">
          <BsThreeDotsVertical />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => onCopy(matter)}>コピー</Menu.Item>
        {!matter.is_completed && !matter.is_fixed && (
          <Menu.Item color="red" onClick={() => onDelete(matter)}>
            削除
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};

export default ThreedotsMenu;
