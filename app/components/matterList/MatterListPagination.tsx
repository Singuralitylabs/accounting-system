"use client";

import { Group, Pagination, Select, Text } from "@mantine/core";
import { MATTER_LIST_PAGE_SIZES } from "../../hooks/useListPagination";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
  startIndex: number;
  endIndex: number;
  total: number;
};

// 一覧共通のページネーション UI（件数表示＋ページ切替＋表示件数切替）。
export function MatterListPagination({
  page,
  totalPages,
  onPageChange,
  perPage,
  onPerPageChange,
  startIndex,
  endIndex,
  total,
}: Props) {
  return (
    <Group justify="space-between" className="px-8 py-3" wrap="wrap">
      <Text size="sm" c="dimmed">
        {total}件中 {startIndex}〜{endIndex}件を表示
      </Text>
      <Group gap="md" wrap="wrap">
        <Select
          aria-label="1ページあたりの表示件数"
          value={String(perPage)}
          onChange={(value) => {
            if (value) onPerPageChange(Number(value));
          }}
          data={MATTER_LIST_PAGE_SIZES.map((size) => ({
            value: String(size),
            label: `${size}件/ページ`,
          }))}
          allowDeselect={false}
          w={140}
        />
        <Pagination
          aria-label="案件一覧のページ切替"
          value={page}
          onChange={onPageChange}
          total={totalPages}
        />
      </Group>
    </Group>
  );
}
