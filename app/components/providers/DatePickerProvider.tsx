"use client";

import { registerLocale } from "react-datepicker";
import { ja } from "date-fns/locale/ja";
import "react-datepicker/dist/react-datepicker.css";

registerLocale("ja", ja);

export function DatePickerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
