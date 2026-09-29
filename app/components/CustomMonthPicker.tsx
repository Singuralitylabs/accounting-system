"use client";

import { MonthPickerInput } from "@mantine/dates";
import { toMonthString } from "../utils/formatter";

interface CustomMonthPickerProps {
  label?: string;
  required?: boolean;
  placeholder: string;
  disabled?: boolean;
  value: string | null;
  onChange: (month: string | null) => void;
  className?: string;
  isClearable?: boolean;
  // Marker per month ("YYYY-MM"): "alert" highlights, "closed" underlines.
  getMonthIndicator?: (month: string) => "alert" | "closed" | null;
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
  getMonthIndicator,
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
      getMonthControlProps={
        getMonthIndicator
          ? (date) => {
              const indicator = getMonthIndicator(toMonthString(date));
              if (indicator === "alert") {
                return {
                  style: {
                    color: "var(--mantine-color-orange-7)",
                    fontWeight: 700,
                  },
                  title: "確定後に未反映の変更があります",
                };
              }
              if (indicator === "closed") {
                return {
                  style: { textDecoration: "underline" },
                  title: "確定済み",
                };
              }
              return {};
            }
          : undefined
      }
    />
  );
};
