"use client";

import { Badge, Button } from "@mantine/core";
import { getActiveMatterFilterChips } from "../../utils/matterListFilters";

type Props = {
  filters: Record<string, Set<string>>;
  onClearKey: (key: string) => void;
  onClearAll: () => void;
};

export const ActiveMatterFilterBar = ({
  filters,
  onClearKey,
  onClearAll,
}: Props) => {
  const chips = getActiveMatterFilterChips(filters);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2">
      <span className="text-sm text-gray-700">絞り込み中:</span>
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="light"
          color="blue"
          size="lg"
          rightSection={
            <button
              type="button"
              aria-label={`${chip.label}の絞り込みを解除`}
              className="ml-1 text-sm leading-none"
              onClick={() => onClearKey(chip.key)}
            >
              ×
            </button>
          }
        >
          {chip.label}: {chip.values.join("、")}
        </Badge>
      ))}
      <Button size="xs" variant="light" onClick={onClearAll}>
        すべて解除
      </Button>
    </div>
  );
};
