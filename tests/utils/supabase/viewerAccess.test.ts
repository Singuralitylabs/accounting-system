import { beforeEach, describe, expect, it, vi } from "vitest";

const { getProfileInfo } = vi.hoisted(() => ({ getProfileInfo: vi.fn() }));
vi.mock("@/app/utils/supabase/profiles", () => ({ getProfileInfo }));

import {
  getAuthorizedViewer,
  getLoggedInViewer,
} from "@/app/utils/supabase/viewerAccess";

describe("getLoggedInViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("class が未設定（null）でもプロフィールがあれば通す（middleware / RLS と同じ判定）", async () => {
    const profileInfo = { id: 1, class: null, is_teamleader: false };
    getProfileInfo.mockResolvedValue({ profileInfo });

    expect(await getLoggedInViewer("事前収支申告")).toEqual({ profileInfo });
  });

  it("プロフィールを取得できなければ fetchFailed を返す", async () => {
    getProfileInfo.mockResolvedValue({ error: new Error("x") });

    const result = await getLoggedInViewer("事前収支申告");

    expect(result.error?.kind).toBe("fetchFailed");
  });

  it("getAuthorizedViewer はロール外を forbidden にする", async () => {
    getProfileInfo.mockResolvedValue({
      profileInfo: { id: 1, class: null, is_teamleader: false },
    });

    const result = await getAuthorizedViewer(["admin"], "対象");

    expect(result.error?.kind).toBe("forbidden");
  });

  it("deniedMessage を渡すと拒否メッセージが変わる", async () => {
    getProfileInfo.mockResolvedValue({
      profileInfo: { id: 1, class: "public", is_teamleader: false },
    });

    const result = await getAuthorizedViewer(
      ["admin"],
      "Slack通知",
      "Slack通知を送信する権限がありません。",
    );

    expect(result.error?.message).toBe("Slack通知を送信する権限がありません。");
  });
});
