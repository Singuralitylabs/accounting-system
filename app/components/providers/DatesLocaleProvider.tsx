"use client";

import "dayjs/locale/ja";
import { DatesProvider } from "@mantine/dates";

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
