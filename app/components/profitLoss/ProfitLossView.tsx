"use client";

import { PLReportType } from "@/app/types/types";
import {
  useAnnualTrend,
  useProfitLossReport,
} from "@/app/hooks/useProfitLossData";
import { Alert, Select, Tabs } from "@mantine/core";
import { useState } from "react";
import { CustomMonthPicker } from "../CustomMonthPicker";
import { LoadingSpinner } from "../LoadingSpinner";
import ProfitLossStatement from "./ProfitLossStatement";
import AnnualTrendTable from "./AnnualTrendTable";

type Props = {
  initialMonth: string; // "YYYY-MM"
  initialReport: PLReportType | null;
};

// 月キー（YYYY-MM）から年度（7月始まり）を求める
const monthToFiscalYear = (month: string) => {
  const year = parseInt(month.slice(0, 4), 10);
  const monthNumber = parseInt(month.slice(5, 7), 10);
  return monthNumber >= 7 ? year : year - 1;
};

const ProfitLossView = ({ initialMonth, initialReport }: Props) => {
  const currentFiscalYear = monthToFiscalYear(initialMonth);

  const [activeTab, setActiveTab] = useState<string | null>("monthly");
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
            <ProfitLossStatement report={report} />
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
            <AnnualTrendTable trend={trend} />
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
};

export default ProfitLossView;
