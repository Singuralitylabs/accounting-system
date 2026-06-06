import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

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

// ローカル時刻ベースで月キー（YYYY-MM）へ変換する（toISOString の UTC ズレを避ける）
const toMonthString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

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
    <div className={className}>
      {label && (
        <label className="text-sm font-medium">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <DatePicker
          selected={value ? new Date(`${value}-01T00:00:00`) : null}
          onChange={(date: Date | null) => {
            onChange(date ? toMonthString(date) : null);
          }}
          dateFormat="yyyy/MM"
          showMonthYearPicker
          placeholderText={placeholder}
          disabled={disabled}
          className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            disabled ? "text-gray-400" : ""
          }`}
          required={required}
          isClearable={isClearable}
          showPopperArrow={false}
          locale="ja"
          wrapperClassName="w-full"
          calendarClassName="shadow-lg"
        />
      </div>
    </div>
  );
};
