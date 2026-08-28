import { Stack, Text } from "@mantine/core";
import { formatCurrency, formatDateToJp } from "../utils/formatter";

type Props = {
  label: string;
  children: React.ReactNode;
  isCurrency?: boolean;
  isDate?: boolean;
};

const LabelText = ({
  label,
  children,
  isCurrency = false,
  isDate = false,
}: Props) => {
  const value =
    typeof children === "number" && isCurrency
      ? formatCurrency(children)
      : typeof children === "string" && isDate
        ? formatDateToJp(children)
        : isCurrency && isDate
          ? "-"
          : children;
  return (
    <Stack gap="xs" className="w-full md:pt-0 pt-4">
      <Text size="sm" fw={500} c="dimmed">
        {label}
      </Text>
      <Text className="p-4 break-words">{value || "未設定"}</Text>
    </Stack>
  );
};

export default LabelText;
