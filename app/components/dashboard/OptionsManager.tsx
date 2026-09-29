"use client";

import { Badge, Paper, Select, Text, UnstyledButton } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { ComponentProps, useCallback, useState } from "react";
import {
  OPTION_CLASS_GROUPS,
  OPTION_CLASSES,
  OptionClass,
  isOptionClass,
} from "../../utils/selectOptionClasses";
import SelectOptionList, { OptionListStatus } from "../SelectOptionList";

type OptionRowData = ComponentProps<
  typeof SelectOptionList
>["optionList"][number];

export type OptionsManagerCategory = {
  optionClass: OptionClass;
  options: OptionRowData[];
  // Only whether the fetch failed; the Error itself is logged on the server.
  hasError: boolean;
};

const OptionsManager = ({
  categories,
}: {
  categories: OptionsManagerCategory[];
}) => {
  const searchParams = useSearchParams();
  const typeParam = searchParams?.get("type");
  const [selected, setSelected] = useState<OptionClass>(
    isOptionClass(typeParam) ? typeParam : OPTION_CLASSES[0].optionClass,
  );
  // Every list stays mounted (only hidden), so edits survive switching and each keeps reporting its unsaved state.
  const [statuses, setStatuses] = useState<
    Partial<Record<OptionClass, OptionListStatus>>
  >(() =>
    Object.fromEntries(
      categories.map(({ optionClass, options }) => [
        optionClass,
        {
          count: options.filter((option) => option.is_active).length,
          changeCount: 0,
        },
      ]),
    ),
  );

  const handleStatusChange = useCallback(
    (optionClass: string, status: OptionListStatus) =>
      setStatuses((prev) => {
        const current = prev[optionClass as OptionClass];
        if (
          current?.count === status.count &&
          current.changeCount === status.changeCount
        ) {
          return prev;
        }
        return { ...prev, [optionClass]: status };
      }),
    [],
  );

  const handleSelect = (optionClass: OptionClass) => {
    setSelected(optionClass);
    const params = new URLSearchParams(searchParams?.toString());
    params.set("type", optionClass);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const errorByClass = new Map(
    categories.map(({ optionClass, hasError }) => [optionClass, hasError]),
  );
  const selectData = OPTION_CLASS_GROUPS.map((group) => ({
    group: group.label,
    items: OPTION_CLASSES.filter((option) => option.group === group.key).map(
      ({ optionClass, label }) => {
        const status = statuses[optionClass];
        const failed = errorByClass.get(optionClass);
        return {
          value: optionClass,
          label: failed
            ? `${label}（取得失敗）`
            : `${label}（${status?.count ?? 0}件）${
                status?.changeCount ? " ● 未保存" : ""
              }`,
        };
      },
    ),
  }));

  return (
    <div className="md:flex md:items-start md:gap-6">
      {/* Both are rendered and switched by CSS, so SSR and hydration always agree. */}
      <Select
        label="編集する項目"
        data={selectData}
        value={selected}
        allowDeselect={false}
        onChange={(value) => isOptionClass(value) && handleSelect(value)}
        className="pb-4 md:hidden"
      />
      <Paper withBorder className="hidden w-[200px] shrink-0 p-2 md:block">
        <nav aria-label="項目の種類">
          {OPTION_CLASS_GROUPS.map((group) => (
            <div key={group.key} className="pb-2">
              <Text size="xs" c="dimmed" fw={600} className="px-2 py-1">
                {group.label}
              </Text>
              {OPTION_CLASSES.filter(
                (option) => option.group === group.key,
              ).map(({ optionClass, label }) => {
                const status = statuses[optionClass];
                const isSelected = selected === optionClass;
                return (
                  <UnstyledButton
                    key={optionClass}
                    type="button"
                    aria-current={isSelected ? "page" : undefined}
                    onClick={() => handleSelect(optionClass)}
                    className={`flex w-full items-center justify-between rounded px-2 py-2 text-sm ${
                      isSelected
                        ? "bg-blue-50 font-semibold text-blue-800"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    <span>{label}</span>
                    <span className="flex items-center gap-1">
                      {status?.changeCount ? (
                        <span
                          role="img"
                          aria-label="未保存の変更あり"
                          className="inline-block h-2 w-2 rounded-full bg-orange-500"
                        />
                      ) : null}
                      {errorByClass.get(optionClass) ? (
                        <Badge color="red" variant="light" size="sm">
                          失敗
                        </Badge>
                      ) : (
                        <Badge color="gray" variant="light" size="sm">
                          {status?.count ?? 0}
                        </Badge>
                      )}
                    </span>
                  </UnstyledButton>
                );
              })}
            </div>
          ))}
        </nav>
      </Paper>
      <div className="min-w-0 flex-1">
        {categories.map(({ optionClass, options, hasError }) => (
          <div key={optionClass} hidden={selected !== optionClass}>
            {hasError ? (
              <Paper withBorder className="p-4 text-red-600">
                {
                  OPTION_CLASSES.find((o) => o.optionClass === optionClass)
                    ?.label
                }
                情報の取得に失敗しました。
              </Paper>
            ) : (
              <SelectOptionList
                optionClass={optionClass}
                optionList={options}
                onStatusChange={handleStatusChange}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OptionsManager;
