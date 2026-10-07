import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, getProfileInfo } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getProfileInfo: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({
  createServerSupabase,
}));

vi.mock("@/app/utils/supabase/profiles", () => ({
  getProfileInfo,
}));

import {
  deleteMatterInfo,
  getTeamMatterInfoList,
} from "@/app/utils/supabase/matters";
import { NO_ROWS_DELETED } from "@/app/utils/supabase/errorCodes";

const select = vi.fn();
const eq = vi.fn(() => ({ select }));
const deleteFn = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ delete: deleteFn }));

describe("deleteMatterInfo", () => {
  beforeEach(() => {
    select.mockReset();
    eq.mockClear();
    deleteFn.mockClear();
    from.mockClear();
    createServerSupabase.mockReturnValue({ from });
  });

  it("削除行を返させるため .select() を付けて呼び、1 件削除できたら成功を返す", async () => {
    select.mockResolvedValue({ data: [{ id: 1 }], error: null });

    const result = await deleteMatterInfo(1);

    expect(from).toHaveBeenCalledWith("matters");
    expect(eq).toHaveBeenCalledWith("id", 1);
    expect(select).toHaveBeenCalled();
    expect(result).toEqual({ status: [{ id: 1 }], error: null });
  });

  it("削除行が 0 件（RLS で弾かれた場合など）なら成功を返さない", async () => {
    select.mockResolvedValue({ data: [], error: null });

    const { status, error } = await deleteMatterInfo(1);

    expect(status).toBeNull();
    expect(error).toMatchObject({
      code: NO_ROWS_DELETED,
      message: "案件ID : 1の削除対象が見つかりませんでした。",
    });
  });

  it("DB エラーはそのまま error として返す", async () => {
    const dbError = { message: "permission denied for table matters" };
    select.mockResolvedValue({ data: null, error: dbError });

    const { status, error } = await deleteMatterInfo(1);

    expect(status).toBeNull();
    expect(error).toBe(dbError);
  });
});

describe("getTeamMatterInfoList", () => {
  const order3 = vi.fn();
  const eqTeam = vi.fn(() => ({ order: () => ({ order: () => ({ order: order3 }) }) }));
  const selectMatters = vi.fn(() => ({ eq: eqTeam }));
  const fromMatters = vi.fn(() => ({ select: selectMatters }));

  beforeEach(() => {
    vi.clearAllMocks();
    order3.mockResolvedValue({ data: [{ id: 1 }], error: null });
    createServerSupabase.mockReturnValue({ from: fromMatters });
  });

  it.each([
    ["public", true],
    ["accounting", true],
    ["admin", false],
  ])(
    "class %s・teamleader フラグ %s でチームが設定されていれば、そのチームの案件を返す",
    async (cls, isTeamleader) => {
      getProfileInfo.mockResolvedValue({
        profileInfo: { class: cls, is_teamleader: isTeamleader, team: "チームA" },
        error: null,
      });

      expect(await getTeamMatterInfoList()).toEqual([{ id: 1 }]);
      expect(eqTeam).toHaveBeenCalledWith("team", "チームA");
    },
  );

  it.each(["public", "accounting", "teamleader", null])(
    "フラグのないクラス（%s）は案件を取得せず null を返す",
    async (cls) => {
      getProfileInfo.mockResolvedValue({
        profileInfo: { class: cls, is_teamleader: false, team: "チームA" },
        error: null,
      });

      expect(await getTeamMatterInfoList()).toBeNull();
      expect(fromMatters).not.toHaveBeenCalled();
    },
  );

  it("チーム未設定なら null を返す", async () => {
    getProfileInfo.mockResolvedValue({
      profileInfo: { class: "public", is_teamleader: true, team: null },
      error: null,
    });

    expect(await getTeamMatterInfoList()).toBeNull();
    expect(fromMatters).not.toHaveBeenCalled();
  });
});
