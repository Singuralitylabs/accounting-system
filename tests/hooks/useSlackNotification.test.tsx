// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatterInfoWithUserNameType } from "@/app/types/types";

const { sendMessageToSlack, bulkUnfixMatterInfo } = vi.hoisted(() => ({
  sendMessageToSlack: vi.fn(),
  bulkUnfixMatterInfo: vi.fn(),
}));

vi.mock("@/app/utils/slack/sendMessageToSlack", () => ({
  default: sendMessageToSlack,
}));
vi.mock("@/app/utils/supabase/matters", () => ({ bulkUnfixMatterInfo }));

import { useSlackNotification } from "@/app/hooks/useMatterData";

const matter = (id: number, title: string) =>
  ({
    id,
    title,
    slack_id: `U${id}`,
    user_name: `担当${id}`,
  }) as unknown as MatterInfoWithUserNameType;

describe("useSlackNotification", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    bulkUnfixMatterInfo.mockResolvedValue({});
  });

  it("案件ごとの失敗（failed）は残りの送信を続け、成功した案件だけ差し戻す", async () => {
    sendMessageToSlack
      .mockResolvedValueOnce({ status: "failed" })
      .mockResolvedValueOnce({ status: "sent" });
    const { result } = renderHook(() => useSlackNotification(), { wrapper });

    result.current.mutate({
      matters: [matter(1, "案件A"), matter(2, "案件B")],
      message: "m",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sendMessageToSlack).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({
      failedTitles: ["案件A"],
      unsentMatterIds: [],
      abortReason: undefined,
      dbUpdateFailed: false,
    });
    expect(bulkUnfixMatterInfo).toHaveBeenCalledWith([2]);
  });

  it("権限などの中止（aborted）では残りの案件を送らず、未送信の案件 ID と理由を返す", async () => {
    sendMessageToSlack.mockResolvedValueOnce({
      status: "aborted",
      reason: "権限がありません。",
    });
    const { result } = renderHook(() => useSlackNotification(), { wrapper });

    result.current.mutate({
      matters: [matter(1, "案件A"), matter(2, "案件B"), matter(3, "案件C")],
      message: "m",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sendMessageToSlack).toHaveBeenCalledTimes(1);
    expect(result.current.data).toMatchObject({
      failedTitles: [],
      unsentMatterIds: [1, 2, 3],
      abortReason: "権限がありません。",
    });
    expect(bulkUnfixMatterInfo).not.toHaveBeenCalled();
  });

  it("途中まで成功して途中で中止（aborted）になったら、成功分だけ差し戻し、残りは未送信として返す", async () => {
    sendMessageToSlack
      .mockResolvedValueOnce({ status: "sent" })
      .mockResolvedValueOnce({
        status: "aborted",
        reason: "権限がありません。",
      });
    const { result } = renderHook(() => useSlackNotification(), { wrapper });

    result.current.mutate({
      matters: [matter(1, "案件A"), matter(2, "案件B"), matter(3, "案件C")],
      message: "m",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sendMessageToSlack).toHaveBeenCalledTimes(2);
    expect(result.current.data).toMatchObject({
      failedTitles: [],
      unsentMatterIds: [2, 3],
    });
    expect(bulkUnfixMatterInfo).toHaveBeenCalledWith([1]);
  });
});
