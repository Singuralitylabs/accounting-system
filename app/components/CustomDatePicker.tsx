"use client";

import { DatePickerInput } from "@mantine/dates";
import { FaRegCalendarAlt } from "react-icons/fa";
import { parseDateString, toDateString } from "../utils/formatter";

interface CustomDatePickerProps {
  label?: string;
  required?: boolean;
  placeholder: string;
  disabled?: boolean;
  value: string | null; // "YYYY-MM-DD"
  onChange: (date: string | null) => void;
  className?: string;
  showIcon?: boolean;
}

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
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      clearable
      valueFormat="YYYY/MM/DD"
      value={parseDateString(value)}
      onChange={(date) => onChange(toDateString(date))}
      leftSection={showIcon ? <FaRegCalendarAlt /> : undefined}
    />
  );
};
