import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServiceRoleSupabase } = vi.hoisted(() => ({
  createServiceRoleSupabase: vi.fn(),
}));
vi.mock("@/app/utils/supabase/clients", () => ({ createServiceRoleSupabase }));

import { DEFAULT_MATTER_NOTICE_SETTINGS } from "@/app/utils/slackNotificationTemplate";
import { getMatterNoticeSettingsForSend } from "@/app/utils/supabase/slackNotificationData";

const mockRow = (result: unknown) =>
  createServiceRoleSupabase.mockReturnValue({
    from: () => ({ select: () => ({ maybeSingle: async () => result }) }),
  });

describe("getMatterNoticeSettingsForSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("保存済みの設定を返す", async () => {
    mockRow({
      data: { matter_notice_header: "H", matter_notice_body_template: "B{message}" },
      error: null,
    });

    expect(await getMatterNoticeSettingsForSend()).toEqual({
      header: "H",
      bodyTemplate: "B{message}",
    });
  });

  it("DB エラー・行なしは既定の固定文にフォールバックする", async () => {
    mockRow({ data: null, error: { message: "x" } });
    expect(await getMatterNoticeSettingsForSend()).toEqual(
      DEFAULT_MATTER_NOTICE_SETTINGS,
    );
    mockRow({ data: null, error: null });
    expect(await getMatterNoticeSettingsForSend()).toEqual(
      DEFAULT_MATTER_NOTICE_SETTINGS,
    );
  });

  it("クライアント生成が例外を投げてもフォールバックする", async () => {
    createServiceRoleSupabase.mockImplementation(() => {
      throw new Error("env");
    });
    expect(await getMatterNoticeSettingsForSend()).toEqual(
      DEFAULT_MATTER_NOTICE_SETTINGS,
    );
  });
});
