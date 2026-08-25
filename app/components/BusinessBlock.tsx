import {
  Card,
  Checkbox,
  Group,
  NumberInput,
  Stack,
  TextInput,
} from "@mantine/core";
import { FaRegTrashAlt } from "react-icons/fa";
import { BusinessInCardType, BusinessType } from "../types/types";
import { formatCurrency, formatDateToJp } from "../utils/formatter";
import { CustomDatePicker } from "./CustomDatePicker";
import LabelText from "./LabelText";

type UserBusinessBlockProps = {
  variant: "user";
  businessInfo: BusinessInCardType;
  formType: string;
  isFixed?: boolean;
  index: number;
  onRemoveBusiness: (id: number) => void;
  onBusinessUpdate: (updatedBusiness: BusinessInCardType) => void;
};

type AccountingBusinessBlockProps = {
  variant: "accounting";
  business: BusinessType;
  businessList: BusinessType[];
  setBusinessList: React.Dispatch<React.SetStateAction<BusinessType[]>>;
  isCompleted: boolean;
};

export type BusinessBlockProps =
  | UserBusinessBlockProps
  | AccountingBusinessBlockProps;

const UserBusinessBlock = ({
  businessInfo,
  formType,
  isFixed = false,
  index,
  onRemoveBusiness,
  onBusinessUpdate,
}: UserBusinessBlockProps) => {
  const handleUpdate = (updates: Partial<BusinessType>) => {
    onBusinessUpdate({ ...businessInfo, ...updates });
  };

  // 申請済みの案件でも、新規追加された項目は編集可能
  const isItemDisabled = isFixed && !businessInfo.isNew;
  const mdBgColorClass = formType === "new" ? "md:bg-slate-50" : "md:bg-white";

  return (
    <div
      key={businessInfo.id}
      className={`border rounded-lg p-2 my-2 items-center bg-green-50 md:flex md:border-none md:p-0 ${mdBgColorClass}`}
    >
      {!isItemDisabled && (
        <div className="md:hidden flex justify-between w-full m-2">
          <div>取引先{index + 1}</div>
          <button
            type="button"
            aria-label="取引先を削除"
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
            disabled={isItemDisabled}
            value={businessInfo.name}
            onChange={(e) => handleUpdate({ name: e.target.value })}
          />
          <NumberInput
            label="報酬額"
            required
            placeholder="報酬額をご記入ください。"
            className="flex-grow"
            disabled={isItemDisabled}
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
            disabled={isItemDisabled}
            value={businessInfo.invoice_date}
            onChange={(date) => handleUpdate({ invoice_date: date })}
            className="flex-grow sm:my-0 my-2"
          />
          <CustomDatePicker
            label="振込期限"
            required
            placeholder="振込期限をご記入ください。"
            disabled={isItemDisabled}
            value={businessInfo.period_date}
            onChange={(date) => handleUpdate({ period_date: date })}
            className="flex-grow sm:my-0 my-2"
          />
        </div>
      </div>
      {!isItemDisabled && (
        <button
          type="button"
          aria-label="取引先を削除"
          className="hidden text-lg hover:cursor-pointer w-4 ml-2 md:flex items-center pb-3 md:self-end justify-center hover:text-blue-500"
          onClick={() => onRemoveBusiness(businessInfo.id)}
        >
          <FaRegTrashAlt />
        </button>
      )}
    </div>
  );
};

const AccountingBusinessBlock = ({
  business,
  businessList,
  setBusinessList,
  isCompleted,
}: AccountingBusinessBlockProps) => {
  return (
    <Card
      key={business.id}
      className="items-center mb-2 relative"
      withBorder
      radius="sm"
      padding="sm"
      aria-label="取引先"
      bg="green.0"
    >
      <div className="flex gap-2 items-center absolute top-2 right-2">
        <Checkbox
          aria-label="受取済み"
          checked={business.is_completed}
          disabled={isCompleted!}
          onChange={(event) =>
            setBusinessList(
              businessList.map((businessInfo) => {
                return businessInfo.id === business.id
                  ? {
                      ...business,
                      is_completed: event.currentTarget.checked,
                    }
                  : businessInfo;
              }),
            )
          }
        />
        <span>確認完了</span>
      </div>

      <div className="flex-grow flex pb-2 pt-8">
        <Group gap="sm" className="flex-grow w-full">
          <Stack gap="xs" className="flex-grow">
            <LabelText label="取引先名">{business.name}</LabelText>
          </Stack>
          <Stack gap="xs" className="flex-grow">
            <LabelText label="請求額">
              {formatCurrency(business.amount)}
            </LabelText>
          </Stack>
          <Stack gap="xs" className="flex-grow">
            <LabelText label="請求日">
              {formatDateToJp(business.invoice_date)}
            </LabelText>
          </Stack>
          <Stack gap="xs" className="flex-grow">
            <LabelText label="振込期限">
              {formatDateToJp(business.period_date)}
            </LabelText>
          </Stack>
        </Group>
      </div>
    </Card>
  );
};

const BusinessBlock = (props: BusinessBlockProps) => {
  if (props.variant === "accounting") {
    return <AccountingBusinessBlock {...props} />;
  }
  return <UserBusinessBlock {...props} />;
};

export default BusinessBlock;
