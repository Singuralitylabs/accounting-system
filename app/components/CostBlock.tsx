import { Checkbox, NumberInput, Select, TextInput } from "@mantine/core";
import { FaRegTrashAlt } from "react-icons/fa";
import { certificateList, itemList } from "../types/params";
import { CostType } from "../types/types";
import { CustomDatePicker } from "./CustomDatePicker";

type Props = {
  costInfo: CostType & {
    isNew?: boolean;
    isRemoved?: boolean;
  };
  isFixed?: boolean;
  index: number;
  bgColor?: string;
  onRemoveCost: (id: number) => void;
  onCostUpdate: (
    updatedCost: CostType & { isNew?: boolean; isRemoved?: boolean }
  ) => void;
};

const CostBlock = ({
  costInfo,
  isFixed = false,
  index,
  bgColor = "bg-white",
  onRemoveCost,
  onCostUpdate,
}: Props) => {
  const handleUpdate = (updates: Partial<CostType>) => {
    onCostUpdate({ ...costInfo, ...updates });
  };

  return (
    <div
      key={costInfo.id}
      className={`lg:flex items-center my-2 lg:p-0 p-2 lg:border-none border rounded-lg lg:${bgColor} bg-slate-50`}
    >
      {!isFixed && (
        <div className="lg:hidden flex justify-between w-full m-2">
          <div>コスト{index + 1}</div>
          <div className="flex gap-2">
            <button
              className="h-full mx-4 text-lg hover:cursor-pointer w-4 ml-auto items-center justify-center hover:text-blue-500"
              onClick={() => onRemoveCost(costInfo.id)}
            >
              <FaRegTrashAlt />
            </button>
          </div>
        </div>
      )}
      <div className="flex-grow lg:flex gap-2 min-w-0">
        <div className="sm:flex gap-2 lg:mb-0 mb-2 flex-1">
          <TextInput
            placeholder="コスト名をご記入ください。"
            className="flex-grow sm:mb-0 mb-2"
            disabled={isFixed!}
            value={costInfo.name}
            onChange={(e) => handleUpdate({ name: e.target.value })}
          />
          <Select
            className="flex-grow sm:mb-0 mb-2 sm:w-40"
            placeholder="品目を選択してください。"
            data={itemList}
            required
            disabled={isFixed!}
            value={costInfo.item}
            onChange={(value) => handleUpdate({ item: value || "" })}
          />
          <TextInput
            placeholder="支払い先の名前をご記入ください。"
            className="flex-grow sm:mb-0 mb-2"
            disabled={isFixed!}
            value={costInfo.payment_target}
            onChange={(e) => handleUpdate({ payment_target: e.target.value })}
          />
        </div>
        <div className="sm:flex gap-2 sm:mb-0 mb-2 flex-1">
          <NumberInput
            placeholder="金額をご記入ください。"
            className="flex-grow sm:mb-0 mb-2"
            disabled={isFixed!}
            value={costInfo.price || ""}
            prefix="¥"
            allowNegative={false}
            allowDecimal={false}
            thousandSeparator=","
            onChange={(value) => handleUpdate({ price: Number(value) })}
          />
          <CustomDatePicker
            placeholder="支払い期限をご記入ください。"
            disabled={isFixed!}
            value={costInfo.period}
            onChange={(date) => handleUpdate({ period: date })}
            className="flex-grow sm:mb-0 mb-2"
          />
          <Select
            className="flex-grow sm:mb-0 mb-2"
            placeholder="支払いの通知方法を選択してください。"
            data={certificateList}
            required
            disabled={isFixed!}
            value={costInfo.certificate}
            onChange={(value) => handleUpdate({ certificate: value || "" })}
          />
          <div className="flex items-center">
            <Checkbox
              label="源泉徴収あり"
              className="whitespace-nowrap flex-shrink-0"
              disabled={isFixed!}
              checked={costInfo.withholding}
              onChange={(e) =>
                handleUpdate({ withholding: e.currentTarget.checked })
              }
            />
          </div>
        </div>
      </div>
      <div className="hidden lg:flex">
        <button
          className="text-lg hover:cursor-pointer w-4 ml-2 flex items-center justify-center hover:text-blue-500"
          onClick={() => onRemoveCost(costInfo.id)}
        >
          <FaRegTrashAlt />
        </button>
      </div>
    </div>
  );
};

export default CostBlock;
