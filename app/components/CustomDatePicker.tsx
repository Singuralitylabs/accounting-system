"use client";

import { DatePickerInput } from "@mantine/dates";
import { FaRegCalendarAlt } from "react-icons/fa";
import { parseDateString, toDateString } from "../utils/formatter";

interface CustomDatePickerProps {
  label?: string;
  description?: string; // 入力欄の下に出す補足説明（Mantine の description）
  required?: boolean;
  placeholder: string;
  disabled?: boolean;
  value: string | null; // "YYYY-MM-DD"
  onChange: (date: string | null) => void;
  className?: string;
  showIcon?: boolean;
  // 選択させない日付（"YYYY-MM-DD" で判定。確定済みの月の日付を選ばせない用途など）
  excludeDate?: (date: string) => boolean;
}

export const CustomDatePicker = ({
  label,
  description,
  required,
  placeholder,
  disabled = false,
  value,
  onChange,
  className = "",
  showIcon = false,
  excludeDate,
}: CustomDatePickerProps) => {
  return (
    <DatePickerInput
      className={className}
      label={label}
      description={description}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      clearable
      valueFormat="YYYY/MM/DD"
      value={parseDateString(value)}
      onChange={(date) => onChange(toDateString(date))}
      leftSection={showIcon ? <FaRegCalendarAlt /> : undefined}
      excludeDate={
        excludeDate
          ? (date) => excludeDate(toDateString(date) ?? "")
          : undefined
      }
    />
  );
};
