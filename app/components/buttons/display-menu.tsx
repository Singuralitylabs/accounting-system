import { BiGridAlt } from "react-icons/bi";
import { FaList } from "react-icons/fa";

type Props = {
  switchDisplay: boolean;
  onSwitchDisplay: (value: boolean) => void;
};
const DisplayMenu = ({ switchDisplay, onSwitchDisplay }: Props) => {
  return (
    <div className="hidden md:flex justify-end pb-4 items-center">
      <span className="px-2">表示形式</span>
      <button
        type="button"
        aria-label="カード表示"
        onClick={() => onSwitchDisplay(true)}
        className={`text-lg hover:cursor-pointer w-8 h-8 flex items-center ${
          switchDisplay && `bg-gray-700 text-white`
        } justify-center rounded`}
      >
        <BiGridAlt />
      </button>
      <button
        type="button"
        aria-label="テーブル表示"
        onClick={() => onSwitchDisplay(false)}
        className={`text-lg hover:cursor-pointer w-8 h-8 flex items-center ${
          !switchDisplay && `bg-gray-700 text-white`
        } justify-center rounded`}
      >
        <FaList />
      </button>
    </div>
  );
};

export default DisplayMenu;
