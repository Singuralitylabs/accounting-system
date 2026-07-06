"use client";

import "dayjs/locale/ja";
import { DatesProvider } from "@mantine/dates";

// @mantine/dates（DatePickerInput / MonthPickerInput）の日本語ロケール設定を提供する。
// dayjs の ja ロケールをクライアント側で読み込み、DatesProvider で locale を指定する。
export function DatesLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DatesProvider settings={{ locale: "ja", firstDayOfWeek: 0 }}>
      {children}
    </DatesProvider>
  );
}
