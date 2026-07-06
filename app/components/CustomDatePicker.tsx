"use client";

import { DatePickerInput } from "@mantine/dates";
import { FaRegCalendarAlt } from "react-icons/fa";

interface CustomDatePickerProps {
  label?: string;
  required?: boolean;
  placeholder: string;
  disabled?: boolean;
  value: string | null; // "YYYY-MM-DD"
  onChange: (date: string | null) => void;
  className?: string;
  showIcon?: boolean;
  // 互換のため受け付けるが、Mantine はドロップダウンを既定でポータル表示するため未使用。
  portalId?: string;
}

// "YYYY-MM-DD" 文字列 ⇔ Date（ローカルタイム）を相互変換する。
// toISOString（UTC）を使うと JST で日付がずれ得るためローカル要素で組み立てる。
const parseDate = (value: string | null): Date | null =>
  value ? new Date(`${value}T00:00:00`) : null;

const formatDate = (date: Date | null): string | null => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const CustomDatePicker = ({
  label,
  required,
  placeholder,
  disabled = false,
  value,
  onChange,
  className = "",
  showIcon = false,
}: CustomDatePickerProps) => {
  return (
    <DatePickerInput
      className={className}
      label={label}
      withAsterisk={required}
      placeholder={placeholder}
      disabled={disabled}
      clearable
      valueFormat="YYYY/MM/DD"
      value={parseDate(value)}
      onChange={(date) => onChange(formatDate(date))}
      leftSection={showIcon ? <FaRegCalendarAlt /> : undefined}
    />
  );
};
