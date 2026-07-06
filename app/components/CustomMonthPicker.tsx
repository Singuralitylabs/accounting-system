"use client";

import { MonthPickerInput } from "@mantine/dates";
import { toMonthString } from "../utils/formatter";

interface CustomMonthPickerProps {
  label?: string;
  required?: boolean;
  placeholder: string;
  disabled?: boolean;
  value: string | null; // "YYYY-MM"
  onChange: (month: string | null) => void;
  className?: string;
  isClearable?: boolean;
}

export const CustomMonthPicker = ({
  label,
  required,
  placeholder,
  disabled = false,
  value,
  onChange,
  className = "",
  isClearable = false,
}: CustomMonthPickerProps) => {
  return (
    <MonthPickerInput
      className={className}
      label={label}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      clearable={isClearable}
      valueFormat="YYYY/MM"
      value={value ? new Date(`${value}-01T00:00:00`) : null}
      onChange={(date) => onChange(date ? toMonthString(date) : null)}
    />
  );
};
