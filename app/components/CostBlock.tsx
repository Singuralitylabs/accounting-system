import { Checkbox, NumberInput, Select, TextInput } from "@mantine/core";
import { FaRegTrashAlt } from "react-icons/fa";
import { CostType } from "../types/types";
import { CustomDatePicker } from "./CustomDatePicker";

type Props = {
  costInfo: CostType & {
    isNew?: boolean;
    isRemoved?: boolean;
  };
  itemList: string[];
  certificateList: string[];
  formType: string;
  isFixed?: boolean;
  index: number;
  onRemoveCost: (id: number) => void;
  onCostUpdate: (
    updatedCost: CostType & { isNew?: boolean; isRemoved?: boolean }
  ) => void;
};

const CostBlock = ({
  costInfo,
  itemList,
  certificateList,
  formType,
  isFixed = false,
  index,
  onRemoveCost,
  onCostUpdate,
}: Props) => {
  const handleUpdate = (updates: Partial<CostType>) => {
    onCostUpdate({ ...costInfo, ...updates });
  };
  const lgBgColor = formType === "new" ? "lg:bg-slate-50" : "lg:bg-white";

  if (!itemList.includes(costInfo.item) && isFixed)
    itemList.push(costInfo.item);
  if (!certificateList.includes(costInfo.certificate) && isFixed)
    certificateList.push(costInfo.certificate);

  return (
    <div
      key={costInfo.id}
      className={`border rounded-lg p-2 my-2 items-center bg-slate-50 ${lgBgColor} lg:flex lg:border-none lg:p-0`}
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
            label="コスト名"
            required
            placeholder="コスト名をご記入ください。"
            className="flex-grow sm:mb-0 mb-2"
            disabled={isFixed!}
            value={costInfo.name}
            onChange={(e) => handleUpdate({ name: e.target.value })}
          />
          <Select
            label="品目"
            required
            className="flex-grow sm:mb-0 mb-2 sm:w-40"
            placeholder="品目を選択してください。"
            data={itemList}
            disabled={isFixed!}
            value={costInfo.item}
            onChange={(value) => handleUpdate({ item: value || "" })}
          />
          <TextInput
            label="支払い先"
            required
            placeholder="支払い先の名前をご記入ください。"
            className="flex-grow sm:mb-0 mb-2"
            disabled={isFixed!}
            value={costInfo.payment_target}
            onChange={(e) => handleUpdate({ payment_target: e.target.value })}
          />
        </div>
        <div className="sm:flex gap-2 sm:mb-0 mb-2 flex-1">
          <NumberInput
            label="金額"
            required
            placeholder="金額をご記入ください。"
            className="flex-grow sm:mb-0 mb-2"
            disabled={isFixed!}
            value={costInfo.price}
            prefix="¥"
            allowNegative={false}
            allowDecimal={false}
            thousandSeparator=","
            onChange={(value) => handleUpdate({ price: Number(value) })}
          />
          <CustomDatePicker
            label="支払い期限"
            required
            placeholder="支払い期限をご記入ください。"
            disabled={isFixed!}
            value={costInfo.period}
            onChange={(date) => handleUpdate({ period: date })}
            className="flex-grow sm:mb-0 mb-2"
          />
          <Select
            label="通知方法"
            required
            className="flex-grow sm:mb-0 mb-2"
            placeholder="支払いの通知方法を選択してください。"
            data={certificateList}
            disabled={isFixed!}
            value={costInfo.certificate}
            onChange={(value) => handleUpdate({ certificate: value || "" })}
          />
          <div className="flex items-end pb-2">
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
      <div className="hidden lg:flex lg:self-end pb-2">
        {!isFixed && (
          <button
            className="text-lg hover:cursor-pointer w-4 ml-2 flex items-end justify-center hover:text-blue-500 h-[38px]"
            onClick={() => onRemoveCost(costInfo.id)}
          >
            <FaRegTrashAlt />
          </button>
        )}
      </div>
    </div>
  );
};

export default CostBlock;
