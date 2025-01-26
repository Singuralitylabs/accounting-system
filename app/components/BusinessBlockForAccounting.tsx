import { Card, Checkbox, Group, Stack } from "@mantine/core";
import { formatCurrency, formatDateToJp } from "../utils/formatter";
import { BusinessType } from "../types/types";
import LabelText from "./LabelText";

type Props = {
  business: BusinessType;
  businessList: BusinessType[];
  setBusinessList: React.Dispatch<React.SetStateAction<BusinessType[]>>;
  isCompleted: boolean;
};
const BusinessBlockForAccounting = ({
  business,
  businessList,
  setBusinessList,
  isCompleted,
}: Props) => {
  return (
    <Card
      key={business.id}
      className="items-center mb-2 relative"
      withBorder
      radius="sm"
      padding="sm"
      aria-label="コスト"
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
              })
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

export default BusinessBlockForAccounting;
