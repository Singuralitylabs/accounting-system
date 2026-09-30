"use client";

import { Group } from "@mantine/core";
import { MonthPickerInput } from "@mantine/dates";
import { addMonths, formatMonthLabel, toMonthString } from "../utils/formatter";
import { StepArrowButton } from "./StepArrowButton";

interface CustomMonthPickerProps {
  label?: string;
  required?: boolean;
  placeholder: string;
  disabled?: boolean;
  value: string | null; // "YYYY-MM"
  onChange: (month: string | null) => void;
  className?: string;
  isClearable?: boolean;
  // Marker per month ("YYYY-MM"): "alert" highlights, "closed" underlines.
  getMonthIndicator?: (month: string) => "alert" | "closed" | null;
  // Opt-in prev/next month buttons for target-month switching (not for form inputs).
  withNavigation?: boolean;
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
  withNavigation = false,
}: CustomMonthPickerProps) => {
  const picker = (
    <MonthPickerInput
      className={withNavigation ? "flex-1 min-w-0" : className}
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

  if (!withNavigation) {
    return picker;
  }

  // Arrows only call onChange so each screen's own guard (discard confirm, reset) still applies.
  const navDisabled = disabled || !value;
  const prevMonth = value ? addMonths(value, -1) : null;
  const nextMonth = value ? addMonths(value, 1) : null;

  return (
    <Group gap="xs" align="flex-end" wrap="nowrap" className={className}>
      <StepArrowButton
        direction="prev"
        label="前月"
        title={prevMonth ? formatMonthLabel(prevMonth) : undefined}
        disabled={navDisabled}
        onClick={() => prevMonth && onChange(prevMonth)}
      />
      {picker}
      <StepArrowButton
        direction="next"
        label="翌月"
        title={nextMonth ? formatMonthLabel(nextMonth) : undefined}
        disabled={navDisabled}
        onClick={() => nextMonth && onChange(nextMonth)}
      />
    </Group>
  );
};
