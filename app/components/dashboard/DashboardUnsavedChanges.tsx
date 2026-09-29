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

// Context sharing whether there are unsaved changes in the dashboard. Each reporter (UserList, six SelectOptionLists) tracks its own state; any unsaved one counts.
// - Reload / closing the tab: the Provider warns via beforeunload.
// - Switching via DashboardNav: beforeunload does not fire for next/link navigation, so DashboardNav checks this value first.
// - Other in-app navigation (header links, browser back) is not confirmed (known limitation).
// Outside the Provider (e.g. unit tests) the default does nothing.
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
  const hasUnsavedChanges = dirtyReporters.size > 0;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers show the warning when returnValue is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const value = useMemo(
    () => ({
      hasUnsavedChanges,
      reportUnsavedChanges,
    }),
    [hasUnsavedChanges, reportUnsavedChanges],
  );
  return (
    <DashboardUnsavedChangesContext.Provider value={value}>
      {children}
    </DashboardUnsavedChangesContext.Provider>
  );
};

export const useDashboardHasUnsavedChanges = () =>
  useContext(DashboardUnsavedChangesContext).hasUnsavedChanges;

// Unregisters on unmount.
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
