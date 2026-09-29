"use client";

import { DatePickerInput } from "@mantine/dates";
import { FaRegCalendarAlt } from "react-icons/fa";
import { parseDateString, toDateString } from "../utils/formatter";

interface CustomDatePickerProps {
  label?: string;
  description?: string;
  required?: boolean;
  placeholder: string;
  disabled?: boolean;
  value: string | null;
  onChange: (date: string | null) => void;
  className?: string;
  showIcon?: boolean;
  // Dates that cannot be selected ("YYYY-MM-DD"), e.g. dates in closed months.
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
