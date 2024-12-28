import { NumberInput, TextInput } from "@mantine/core";
import { FaRegTrashAlt } from "react-icons/fa";
import { BusinessType } from "../types/types";
import { CustomDatePicker } from "./CustomDatePicker";

type Props = {
  businessInfo: BusinessType & {
    isNew?: boolean;
    isRemoved?: boolean;
  };
  formType: string;
  isFixed?: boolean;
  index: number;
  onRemoveBusiness: (id: number) => void;
  onBusinessUpdate: (
    updatedBusiness: BusinessType & { isNew?: boolean; isRemoved?: boolean }
  ) => void;
};

const BusinessBlock = ({
  businessInfo,
  formType,
  isFixed = false,
  index,
  onRemoveBusiness,
  onBusinessUpdate,
}: Props) => {
  const handleUpdate = (updates: Partial<BusinessType>) => {
    onBusinessUpdate({ ...businessInfo, ...updates });
  };

  const mdBgColorClass = formType === "new" ? "md:bg-slate-50" : "md:bg-white";

  return (
    <div
      key={businessInfo.id}
      className={`border rounded-lg p-2 my-2 items-center bg-green-50 md:flex md:border-none md:p-0 ${mdBgColorClass}`}
    >
      {!isFixed && (
        <div className="md:hidden flex justify-between w-full m-2">
          <div>取引先{index + 1}</div>
          <button
            className="h-full mx-4 text-lg hover:cursor-pointer w-4 ml-auto items-center justify-center hover:text-blue-500"
            onClick={() => onRemoveBusiness(businessInfo.id)}
          >
            <FaRegTrashAlt />
          </button>
        </div>
      )}
      <div className="md:flex gap-4 w-full">
        <div className="sm:flex md:my-0 my-2 gap-4 w-full">
          <TextInput
            label="取引先名"
            required
            placeholder="取引先名をご記入ください。"
            className="flex-grow sm:my-0 my-2"
            disabled={isFixed!}
            value={businessInfo.name}
            onChange={(e) => handleUpdate({ name: e.target.value })}
          />
          <NumberInput
            label="報酬額"
            required
            placeholder="報酬額をご記入ください。"
            className="flex-grow"
            disabled={isFixed!}
            value={businessInfo.amount!}
            prefix="¥"
            allowNegative={false}
            allowDecimal={false}
            thousandSeparator=","
            onChange={(value) => handleUpdate({ amount: Number(value) })}
          />
        </div>
        <div className="sm:flex gap-4 w-full">
          <CustomDatePicker
            label="請求日"
            required
            placeholder="請求日をご記入ください。"
            disabled={isFixed!}
            value={businessInfo.invoice_date}
            onChange={(date) => handleUpdate({ invoice_date: date })}
            className="flex-grow sm:my-0 my-2"
          />
          <CustomDatePicker
            label="振込期限"
            required
            placeholder="振込期限をご記入ください。"
            disabled={isFixed!}
            value={businessInfo.period_date}
            onChange={(date) => handleUpdate({ period_date: date })}
            className="flex-grow sm:my-0 my-2"
          />
        </div>
      </div>
      {!isFixed && (
        <button
          className="hidden text-lg hover:cursor-pointer w-4 ml-2 md:flex items-center pb-3 md:self-end justify-center hover:text-blue-500"
          onClick={() => onRemoveBusiness(businessInfo.id)}
        >
          <FaRegTrashAlt />
        </button>
      )}
    </div>
  );
};

export default BusinessBlock;
