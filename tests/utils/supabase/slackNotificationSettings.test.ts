import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, getAuthorizedViewer } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getAuthorizedViewer: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
vi.mock("@/app/utils/supabase/viewerAccess", () => ({ getAuthorizedViewer }));

import {
  getSlackNotificationSettings,
  updateSlackNotificationSettings,
} from "@/app/utils/supabase/slackNotificationSettings";

const valid = { header: "ヘッダ", bodyTemplate: "{matter}\n{message}" };

describe("getSlackNotificationSettings", () => {
  const maybeSingle = vi.fn();
  const select = vi.fn(() => ({ maybeSingle }));
  const from = vi.fn(() => ({ select }));

  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabase.mockReturnValue({ from });
    getAuthorizedViewer.mockResolvedValue({ profileInfo: { class: "admin" } });
  });

  it("admin / accounting は設定を取得できる", async () => {
    maybeSingle.mockResolvedValue({
      data: { matter_notice_header: "H", matter_notice_body_template: "B{message}" },
      error: null,
    });

    const result = await getSlackNotificationSettings();

    expect(getAuthorizedViewer).toHaveBeenCalledWith(
      expect.arrayContaining(["admin", "accounting"]),
      expect.any(String),
    );
    expect(getAuthorizedViewer.mock.calls[0][0]).toHaveLength(2);
    expect(result).toEqual({ settings: { header: "H", bodyTemplate: "B{message}" } });
  });

  it("権限不足なら取得せずエラーを返す", async () => {
    getAuthorizedViewer.mockResolvedValue({
      error: { kind: "forbidden", message: "権限がありません。" },
    });

    const result = await getSlackNotificationSettings();

    expect(from).not.toHaveBeenCalled();
    expect(result.error?.kind).toBe("forbidden");
  });

  it("DB エラーや行なしは fetchFailed", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "x" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getSlackNotificationSettings();

    expect(result.error?.kind).toBe("fetchFailed");
  });
});

describe("updateSlackNotificationSettings", () => {
  const select = vi.fn();
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));

  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabase.mockReturnValue({ from });
    getAuthorizedViewer.mockResolvedValue({ profileInfo: { class: "accounting" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("id = 1 の行を更新する", async () => {
    select.mockResolvedValue({ data: [{ id: 1 }], error: null });

    const result = await updateSlackNotificationSettings(valid);

    expect(update).toHaveBeenCalledWith({
      matter_notice_header: "ヘッダ",
      matter_notice_body_template: "{matter}\n{message}",
    });
    expect(eq).toHaveBeenCalledWith("id", 1);
    expect(result).toEqual({});
  });

  it("権限不足なら更新しない（Server Action 直呼びも拒否）", async () => {
    getAuthorizedViewer.mockResolvedValue({
      error: { kind: "forbidden", message: "権限がありません。" },
    });

    const result = await updateSlackNotificationSettings(valid);

    expect(update).not.toHaveBeenCalled();
    expect(result.error?.kind).toBe("forbidden");
  });

  it("文字列でない入力は TypeError にせず validationFailed を返す", async () => {
    const result = await updateSlackNotificationSettings({
      header: null,
      bodyTemplate: 1,
    } as never);

    expect(update).not.toHaveBeenCalled();
    expect(result.error?.kind).toBe("validationFailed");
  });

  it("{message} を含まないテンプレートは更新しない", async () => {
    const result = await updateSlackNotificationSettings({
      header: "h",
      bodyTemplate: "{matter}",
    });

    expect(update).not.toHaveBeenCalled();
    expect(result.error?.message).toContain("{message}");
  });

  it("未知のプレースホルダは更新しない", async () => {
    const result = await updateSlackNotificationSettings({
      header: "h",
      bodyTemplate: "{message}{foo}",
    });

    expect(update).not.toHaveBeenCalled();
    expect(result.error?.message).toContain("{foo}");
  });

  it("RLS で 0 行になった場合はエラー", async () => {
    select.mockResolvedValue({ data: [], error: null });

    const result = await updateSlackNotificationSettings(valid);

    expect(result.error?.kind).toBe("fetchFailed");
  });

  it("DB エラーはエラーを返す", async () => {
    select.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await updateSlackNotificationSettings(valid);

    expect(result.error?.kind).toBe("fetchFailed");
  });
});
