"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// 管理画面（/dashboard 配下）で「未保存の変更があるか」を共有する Context。
// beforeunload はアプリ内の遷移（next/link）では発火しないため、サイドメニュー / タブ
// （DashboardNav）からの画面切り替えの前に、この値を見て確認する。
// Provider の外（単体テスト等）では何もしない既定値になる。
type DashboardUnsavedChangesContextValue = {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
};

const DashboardUnsavedChangesContext =
  createContext<DashboardUnsavedChangesContextValue>({
    hasUnsavedChanges: false,
    setHasUnsavedChanges: () => {},
  });

export const DashboardUnsavedChangesProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const value = useMemo(
    () => ({ hasUnsavedChanges, setHasUnsavedChanges }),
    [hasUnsavedChanges],
  );
  return (
    <DashboardUnsavedChangesContext.Provider value={value}>
      {children}
    </DashboardUnsavedChangesContext.Provider>
  );
};

// 未保存の変更があるか（DashboardNav が遷移前の確認に使う）
export const useDashboardHasUnsavedChanges = () =>
  useContext(DashboardUnsavedChangesContext).hasUnsavedChanges;

// 画面側（UserList 等）が未保存の変更の有無を知らせる。画面を離れたら（アンマウント）解除する
export const useReportDashboardUnsavedChanges = (hasChanges: boolean) => {
  const { setHasUnsavedChanges } = useContext(DashboardUnsavedChangesContext);
  useEffect(() => {
    setHasUnsavedChanges(hasChanges);
    return () => setHasUnsavedChanges(false);
  }, [hasChanges, setHasUnsavedChanges]);
};
