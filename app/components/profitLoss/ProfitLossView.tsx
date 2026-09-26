"use client";

import { PLReportType } from "@/app/types/types";
import {
  useAnnualTrend,
  useProfitLossReport,
} from "@/app/hooks/useProfitLossData";
import { Alert, Group, Select, Tabs } from "@mantine/core";
import { useState } from "react";
import { CustomMonthPicker } from "../CustomMonthPicker";
import { LoadingSpinner } from "../LoadingSpinner";
import ProfitLossStatement, {
  BreakdownTab,
  DEFAULT_BREAKDOWN_TAB,
  resolveBreakdownTab,
} from "./ProfitLossStatement";
import AnnualTrendTable from "./AnnualTrendTable";
import AccountingMasterActions from "./AccountingMasterActions";
import CopyPreviousExtraEntriesButton from "./CopyPreviousExtraEntriesButton";
import ClosingControl from "./ClosingControl";
import ClosingDiffBanner from "./ClosingDiffBanner";
import {
  useClosedMonths,
  useClosingDiffSummary,
} from "@/app/hooks/useProfitLossClosing";

type Props = {
  initialMonth: string; // "YYYY-MM"
  initialReport: PLReportType | null;
  canEditRecurringCosts: boolean; // 定期費用マスタへの管理リンクを表示するか
  canEditExtraEntries: boolean; // 経理追加収支への管理リンクを表示するか
  canEditAdjustments: boolean; // 損益調整（実績額修正）の操作を表示するか
  canEditLabels: boolean; // 表示タイトルの変更操作を表示するか
  canClose: boolean; // 月次収支の確定・確定解除を操作できるか（Issue #148）
};

// 月キー（YYYY-MM）から年度（7月始まり）を求める
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
  // 月次の収支の内訳タブ（Issue #152）。月を切り替えても維持する
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
  // 確定済みの月（月ピッカーの目印）と、確定後に未反映の変更がある月（Issue #149。
  // ページ上部のバナー・月ピッカー・年間推移の目印。経理担当者・管理者のみ）
  const { closedMonths } = useClosedMonths();
  const { data: diffSummary } = useClosingDiffSummary(canClose);
  const diffCountByMonth = new Map(
    (diffSummary ?? []).map(({ month: m, count }) => [m, count]),
  );

  // 年度の選択肢（当年度+1 〜 当年度-4）
  const fiscalYearOptions = Array.from({ length: 6 }, (_, i) => {
    const year = currentFiscalYear + 1 - i;
    return {
      value: String(year),
      label: `${year}年度（${year}/7〜${year + 1}/6）`,
    };
  });

  return (
    <div className="px-4 pb-8 max-w-5xl mx-auto">
      <AccountingMasterActions
        canEditRecurringCosts={canEditRecurringCosts}
        canEditExtraEntries={canEditExtraEntries}
      />
      {canClose && (
        <ClosingDiffBanner
          summary={diffSummary ?? []}
          onSelectMonth={(selected) => {
            setActiveTab("monthly");
            setMonth(selected);
          }}
        />
      )}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="monthly">月次</Tabs.Tab>
          <Tabs.Tab value="annual">年間推移</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="monthly" className="pt-4">
          <div className="max-w-xs mb-4">
            <CustomMonthPicker
              label="対象月"
              placeholder="対象月を選択"
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
                    hasExistingEntries={report.extraEntries.length > 0}
                    isClosed={!!report.closing}
                  />
                </Group>
              )}
              {/* 月ごとに作り直し、展開状態・差分一覧の選択を別の月へ持ち越さない
                  （他の月へ移動した明細は両月で同じキーになるため、選択が残ると
                  選んでいない月で反映してしまう） */}
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
          <div className="max-w-xs mb-4">
            <Select
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
          </div>
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
            <AnnualTrendTable
              trend={trend}
              diffCountByMonth={diffCountByMonth}
            />
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
};

export default ProfitLossView;
