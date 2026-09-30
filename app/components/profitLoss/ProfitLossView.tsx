"use client";

import { PLReportType } from "@/app/types/types";
import {
  useAnnualTrend,
  useProfitLossReport,
} from "@/app/hooks/useProfitLossData";
import { Alert, Group, Select, Tabs } from "@mantine/core";
import dynamic from "next/dynamic";
import { useState } from "react";
import { CustomMonthPicker } from "../CustomMonthPicker";
import { LoadingSpinner } from "../LoadingSpinner";
import { StepArrowButton } from "../StepArrowButton";
import ProfitLossStatement, {
  BreakdownTab,
  DEFAULT_BREAKDOWN_TAB,
  resolveBreakdownTab,
} from "./ProfitLossStatement";
import AnnualTrendTable from "./AnnualTrendTable";
import AnnualTrendChartFrame, {
  AnnualTrendChartPlaceholder,
} from "./AnnualTrendChartFrame";
import AccountingMasterActions from "./AccountingMasterActions";
import CopyPreviousExtraEntriesButton from "./CopyPreviousExtraEntriesButton";
import ClosingControl from "./ClosingControl";
import ClosingDiffBanner from "./ClosingDiffBanner";
import ClosingDiffScopeNote, {
  isBeforeDiffScope,
  isClosedMonthBeforeDiffScope,
} from "./ClosingDiffScopeNote";
import {
  useClosedMonths,
  useClosingDiffSummary,
} from "@/app/hooks/useProfitLossClosing";

// The annual trend chart pulls in Recharts, so it is kept out of the initial bundle and loaded when the annual tab shows, with a same-height placeholder in the frame.
const loadAnnualTrendChart = () => import("./AnnualTrendChart");
const AnnualTrendChart = dynamic(loadAnnualTrendChart, {
  ssr: false,
  loading: () => <AnnualTrendChartPlaceholder />,
});

type Props = {
  initialMonth: string; // "YYYY-MM"
  initialReport: PLReportType | null;
  canEditRecurringCosts: boolean;
  canEditExtraEntries: boolean;
  canEditAdjustments: boolean;
  canEditLabels: boolean;
  canClose: boolean;
};

const monthToFiscalYear = (month: string) => {
  const year = parseInt(month.slice(0, 4), 10);
  const monthNumber = parseInt(month.slice(5, 7), 10);
  return monthNumber >= 7 ? year : year - 1;
};

const ProfitLossView = ({
  initialMonth,
  initialReport,
  canEditRecurringCosts,
  canEditExtraEntries,
  canEditAdjustments,
  canEditLabels,
  canClose,
}: Props) => {
  const currentFiscalYear = monthToFiscalYear(initialMonth);

  const [activeTab, setActiveTab] = useState<string | null>("monthly");
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>(
    DEFAULT_BREAKDOWN_TAB,
  );
  const [month, setMonth] = useState<string>(initialMonth);
  const [fiscalYear, setFiscalYear] = useState<number>(currentFiscalYear);

  const {
    data: report,
    isLoading: isReportLoading,
    isError: isReportError,
  } = useProfitLossReport(
    month,
    month === initialMonth ? initialReport : undefined,
  );
  const {
    data: trend,
    isLoading: isTrendLoading,
    isError: isTrendError,
  } = useAnnualTrend(fiscalYear, undefined, activeTab === "annual");
  const { closedMonths } = useClosedMonths();
  const { data: diffSummary } = useClosingDiffSummary(canClose);
  const diffCountByMonth = new Map(
    (diffSummary?.summary ?? []).map(({ month: m, count }) => [m, count]),
  );
  // Note the count scope when showing a closed month before the count's start month (not when the summary is unfetched or failed).
  const diffScopeFromMonth = diffSummary?.fromMonth;
  const hasClosedMonthBeforeDiffScope = Array.from(closedMonths).some((m) =>
    isBeforeDiffScope(m, diffScopeFromMonth),
  );

  const fiscalYearOptions = Array.from({ length: 6 }, (_, i) => {
    const year = currentFiscalYear + 1 - i;
    return {
      value: String(year),
      label: `${year}年度（${year}/7〜${year + 1}/6）`,
    };
  });

  // Options descend from newest; neighbours are null at the ends of the range.
  const fiscalYearIndex = fiscalYearOptions.findIndex(
    (o) => o.value === String(fiscalYear),
  );
  const nextFiscalYear =
    fiscalYearIndex > 0
      ? parseInt(fiscalYearOptions[fiscalYearIndex - 1].value, 10)
      : null;
  const prevFiscalYear =
    fiscalYearIndex >= 0 && fiscalYearIndex < fiscalYearOptions.length - 1
      ? parseInt(fiscalYearOptions[fiscalYearIndex + 1].value, 10)
      : null;

  return (
    <div className="px-4 pb-8 max-w-5xl mx-auto">
      <AccountingMasterActions
        canEditRecurringCosts={canEditRecurringCosts}
        canEditExtraEntries={canEditExtraEntries}
        // Passing the monthly tab's month while on the annual tab would mismatch the screen.
        month={activeTab === "monthly" ? month : undefined}
      />
      {canClose && (
        <ClosingDiffBanner
          summary={diffSummary?.summary ?? []}
          scopeFromMonth={
            hasClosedMonthBeforeDiffScope ? diffScopeFromMonth : undefined
          }
          onSelectMonth={(selected) => {
            setActiveTab("monthly");
            setMonth(selected);
          }}
        />
      )}
      <Tabs
        value={activeTab}
        onChange={(value) => {
          if (value === "annual") {
            // Prefetch the chart in parallel; failures are swallowed since next/dynamic loads it again on display.
            loadAnnualTrendChart().catch(() => {});
          }
          setActiveTab(value);
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="monthly">月次</Tabs.Tab>
          <Tabs.Tab value="annual">年間推移</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="monthly" className="pt-4">
          <div className="max-w-xs mb-4">
            <CustomMonthPicker
              label="対象月"
              placeholder="対象月を選択"
              withNavigation
              value={month}
              onChange={(selected) => {
                if (selected) {
                  setMonth(selected);
                }
              }}
              getMonthIndicator={(m) =>
                diffCountByMonth.has(m)
                  ? "alert"
                  : closedMonths.has(m)
                    ? "closed"
                    : null
              }
            />
          </div>
          {/* Note the marker scope for a closed month outside the count range. */}
          {canClose &&
            diffScopeFromMonth &&
            isClosedMonthBeforeDiffScope(
              month,
              closedMonths.has(month),
              diffScopeFromMonth,
            ) && (
              <ClosingDiffScopeNote
                fromMonth={diffScopeFromMonth}
                className="-mt-2 mb-4"
              />
            )}
          {isReportError ? (
            <Alert color="red" title="損益レポートの取得に失敗しました">
              時間をおいてページを再読み込みしてください。
            </Alert>
          ) : isReportLoading ? (
            <LoadingSpinner />
          ) : !report ? (
            <Alert color="gray" title="表示できるデータがありません">
              対象月を変えるか、時間をおいて再読み込みしてください。
            </Alert>
          ) : (
            <>
              <ClosingControl
                month={report.month}
                closing={report.closing ?? null}
                canClose={canClose}
              />
              {canEditExtraEntries && (
                <Group justify="flex-end" className="mb-4">
                  <CopyPreviousExtraEntriesButton
                    month={month}
                    hasExistingEntries={
                      report.extraIncome.entries.length +
                        report.extraExpense.entries.length >
                      0
                    }
                    isClosed={!!report.closing}
                  />
                </Group>
              )}
              {/* Recreated per month so expansion state and diff selection do not carry over to another month. */}
              <ProfitLossStatement
                key={report.month}
                report={report}
                canEditAdjustments={canEditAdjustments}
                canEditLabels={canEditLabels}
                breakdownTab={resolveBreakdownTab(
                  breakdownTab,
                  !!report.byTeam,
                )}
                onBreakdownTabChange={setBreakdownTab}
              />
            </>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="annual" className="pt-4">
          <Group
            gap="xs"
            align="flex-end"
            wrap="nowrap"
            className="max-w-xs mb-4"
          >
            <StepArrowButton
              direction="prev"
              label="前年度"
              title={prevFiscalYear ? `${prevFiscalYear}年度` : undefined}
              disabled={!prevFiscalYear}
              onClick={() => prevFiscalYear && setFiscalYear(prevFiscalYear)}
            />
            <Select
              className="flex-1 min-w-0"
              label="年度"
              value={String(fiscalYear)}
              onChange={(selected) => {
                if (selected) {
                  setFiscalYear(parseInt(selected, 10));
                }
              }}
              data={fiscalYearOptions}
              allowDeselect={false}
            />
            <StepArrowButton
              direction="next"
              label="翌年度"
              title={nextFiscalYear ? `${nextFiscalYear}年度` : undefined}
              disabled={!nextFiscalYear}
              onClick={() => nextFiscalYear && setFiscalYear(nextFiscalYear)}
            />
          </Group>
          {isTrendError ? (
            <Alert color="red" title="年間推移の取得に失敗しました">
              時間をおいてページを再読み込みしてください。
            </Alert>
          ) : isTrendLoading ? (
            <LoadingSpinner />
          ) : !trend ? (
            <Alert color="gray" title="表示できるデータがありません">
              年度を変えるか、時間をおいて再読み込みしてください。
            </Alert>
          ) : (
            <>
              <AnnualTrendTable
                trend={trend}
                diffCountByMonth={diffCountByMonth}
                diffScopeFromMonth={canClose ? diffScopeFromMonth : undefined}
              />
              {/* Render the chart only while the annual tab is shown: Tabs keeps hidden panels mounted (re-measured at width 0 and redrawn on every refetch), and Tabs.Panel keepMounted={false} is ORed with Tabs' own so it has no effect. */}
              <AnnualTrendChartFrame fiscalYear={trend.fiscalYear}>
                {activeTab === "annual" && <AnnualTrendChart trend={trend} />}
              </AnnualTrendChartFrame>
            </>
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
};

export default ProfitLossView;
