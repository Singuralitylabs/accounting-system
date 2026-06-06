import { Card, Checkbox, Group, Stack } from "@mantine/core";
import { formatCurrency, formatDateToJp } from "../utils/formatter";
import { CostType } from "../types/types";
import LabelText from "./LabelText";

type Props = {
  cost: CostType;
  costList: CostType[];
  setCostList: React.Dispatch<React.SetStateAction<CostType[]>>;
  isCompleted: boolean;
};

const CostBlockForAccounting = ({
  cost,
  costList,
  setCostList,
  isCompleted,
}: Props) => {
  return (
    <Card
      key={cost.id}
      className="mb-4 relative"
      withBorder
      radius="sm"
      padding="sm"
      aria-label="コスト"
      bg="gray.0"
    >
      <div className="flex gap-2 items-center absolute top-2 right-2">
        <Checkbox
          aria-label="支払い済み"
          checked={cost.is_completed}
          disabled={isCompleted!}
          onChange={(event) =>
            setCostList(
              costList.map((costInfo) => {
                return costInfo.id === cost.id
                  ? {
                      ...cost,
                      is_completed: event.currentTarget.checked,
                    }
                  : costInfo;
              }),
            )
          }
        />
        <span>支払い完了</span>
      </div>

      <div className="flex-grow pt-8">
        <div className="flex pb-2">
          <Group gap="sm" className="flex-grow w-full">
            <Stack gap="xs" className="flex-grow">
              <LabelText label="コスト名">{cost.name}</LabelText>
            </Stack>
            <Stack gap="xs" className="flex-grow">
              <LabelText label="品目">{cost.item}</LabelText>
            </Stack>
            <Stack gap="xs" className="flex-grow">
              <LabelText label="価格">{formatCurrency(cost.price)}</LabelText>
            </Stack>
          </Group>
        </div>
        <div className="items-center pb-2">
          <Group gap="sm" className="flex-grow">
            <Stack gap="xs" className="flex-grow">
              <LabelText label="支払い期限">
                {formatDateToJp(cost.period)}
              </LabelText>
            </Stack>
            <Stack gap="xs" className="flex-grow">
              <LabelText label="支払い先">{cost.payment_target}</LabelText>
            </Stack>
            <Stack gap="xs" className="flex-grow">
              <LabelText label="申請方法">{cost.certificate}</LabelText>
            </Stack>
            <Stack gap="xs" className="flex-grow">
              <LabelText label="源泉徴収">
                {cost.withholding ? "あり" : "なし"}
              </LabelText>
            </Stack>
          </Group>
        </div>
      </div>
    </Card>
  );
};

export default CostBlockForAccounting;
