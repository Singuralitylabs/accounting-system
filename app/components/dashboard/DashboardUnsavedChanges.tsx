"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

// 管理画面（/dashboard 配下）で「未保存の変更があるか」を共有する Context。
// beforeunload はアプリ内の遷移（next/link）では発火しないため、サイドメニュー / タブ
// （DashboardNav）からの画面切り替えの前に、この値を見て確認する。
// 報告元は複数ある（ユーザー管理の UserList、項目管理の 6 枚の SelectOptionList）ため、
// 報告元ごとに未保存かを持ち、どれか 1 つでも未保存なら「未保存の変更あり」とする。
// Provider の外（単体テスト等）では何もしない既定値になる。
type DashboardUnsavedChangesContextValue = {
  hasUnsavedChanges: boolean;
  reportUnsavedChanges: (reporterId: string, hasChanges: boolean) => void;
};

const DashboardUnsavedChangesContext =
  createContext<DashboardUnsavedChangesContextValue>({
    hasUnsavedChanges: false,
    reportUnsavedChanges: () => {},
  });

export const DashboardUnsavedChangesProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  // 未保存の変更がある報告元の id
  const [dirtyReporters, setDirtyReporters] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const reportUnsavedChanges = useCallback(
    (reporterId: string, hasChanges: boolean) =>
      setDirtyReporters((prev) => {
        if (prev.has(reporterId) === hasChanges) return prev;
        const next = new Set(prev);
        if (hasChanges) {
          next.add(reporterId);
        } else {
          next.delete(reporterId);
        }
        return next;
      }),
    [],
  );
  const value = useMemo(
    () => ({
      hasUnsavedChanges: dirtyReporters.size > 0,
      reportUnsavedChanges,
    }),
    [dirtyReporters, reportUnsavedChanges],
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

// 画面側（UserList・SelectOptionList）が未保存の変更の有無を知らせる。
// 画面を離れたら（アンマウント）解除する
export const useReportDashboardUnsavedChanges = (hasChanges: boolean) => {
  const reporterId = useId();
  const { reportUnsavedChanges } = useContext(DashboardUnsavedChangesContext);
  useEffect(() => {
    reportUnsavedChanges(reporterId, hasChanges);
  }, [reporterId, hasChanges, reportUnsavedChanges]);
  useEffect(
    () => () => reportUnsavedChanges(reporterId, false),
    [reporterId, reportUnsavedChanges],
  );
};
