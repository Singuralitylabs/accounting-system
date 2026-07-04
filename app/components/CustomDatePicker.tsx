import DatePicker from "./datePicker";

interface CustomDatePickerProps {
  label?: string;
  required?: boolean;
  placeholder: string;
  disabled?: boolean;
  value: string | null;
  onChange: (date: string | null) => void;
  className?: string;
  showIcon?: boolean;
  // overflow を持つコンテナ（横スクロールするテーブルなど）内で使う場合に指定すると、
  // カレンダーをポータル表示にしてコンテナにクリップされないようにする
  portalId?: string;
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
  portalId,
}: CustomDatePickerProps) => {
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
          showIcon={showIcon}
          selected={value ? new Date(value) : null}
          onChange={(date: Date | null) => {
            if (date) {
              const formattedDate = date.toISOString().split("T")[0];
              onChange(formattedDate);
            } else {
              onChange(null);
            }
          }}
          dateFormat="yyyy/MM/dd"
          placeholderText={placeholder}
          disabled={disabled}
          className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            disabled ? "text-gray-400" : ""
          }`}
          required={required}
          isClearable
          showPopperArrow={false}
          locale="ja"
          wrapperClassName="w-full"
          calendarClassName="shadow-lg"
          portalId={portalId}
          customInput={
            <input
              type="text"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={
                value
                  ? new Date(value).toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })
                  : ""
              }
              readOnly
            />
          }
        />
      </div>
    </div>
  );
};
