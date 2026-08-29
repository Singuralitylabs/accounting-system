import { Checkbox } from "@mantine/core";
import { FaCheck } from "react-icons/fa";

type Props = {
  id: number;
  isCompleted: boolean;
  matterIdList: number[];
  setMatterIdList: (matterIdList: number[]) => void;
};

const AccountingCheckbox = ({
  id,
  isCompleted,
  matterIdList,
  setMatterIdList,
}: Props) => {
  return (
    <div>
      {isCompleted ? (
        <FaCheck />
      ) : (
        <Checkbox
          aria-label="案件チェック"
          checked={matterIdList.includes(id)}
          onChange={(event) =>
            setMatterIdList(
              event.currentTarget.checked
                ? [...matterIdList, id]
                : matterIdList.filter((matterId) => matterId !== id),
            )
          }
        />
      )}
    </div>
  );
};

export default AccountingCheckbox;
