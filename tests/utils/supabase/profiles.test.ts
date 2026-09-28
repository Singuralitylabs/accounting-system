import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, getCachedProfileInfo } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getCachedProfileInfo: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({
  createServerSupabase,
}));
// bulkUpdateProfiles は保存する人のプロフィール（getProfileInfo → getCachedProfileInfo）で
// 権限を確認する。requestCache 経由の react cache をテスト環境に持ち込まないためモックする
vi.mock("@/app/utils/supabase/requestCache", () => ({
  getCachedProfileInfo,
  getCachedProfileInfoById: vi.fn(),
}));

import {
  bulkUpdateProfiles,
  getAllUserInfo,
} from "@/app/utils/supabase/profiles";

const order = vi.fn();
const select = vi.fn(() => ({ order }));
const from = vi.fn(() => ({ select }));

describe("getAllUserInfo", () => {
  beforeEach(() => {
    order.mockReset();
    select.mockClear();
    from.mockClear();
    createServerSupabase.mockReturnValue({ from });
  });

  it("取得できたら一覧と error: null を返す", async () => {
    const rows = [{ id: 1, name: "山田" }];
    order.mockResolvedValue({ data: rows, error: null });

    const result = await getAllUserInfo();

    expect(from).toHaveBeenCalledWith("profiles");
    expect(result).toEqual({ userInfoList: rows, error: null });
  });

  it("0 件は成功として返す（エラーにしない）", async () => {
    order.mockResolvedValue({ data: [], error: null });

    const { userInfoList, error } = await getAllUserInfo();

    expect(userInfoList).toEqual([]);
    expect(error).toBeNull();
  });

  it("DB エラーを握りつぶさず、空配列に置き換えずに返す", async () => {
    const dbError = { message: "permission denied for table profiles" };
    order.mockResolvedValue({ data: null, error: dbError });

    const { userInfoList, error } = await getAllUserInfo();

    // 取得失敗を「0 件」と区別できるよう、error をそのまま伝播する
    expect(error).toBe(dbError);
    expect(userInfoList).toBeNull();
  });
});

describe("bulkUpdateProfiles", () => {
  const rpc = vi.fn();
  const updates = [
    {
      id: 1,
      name: "山田",
      class: "teamleader",
      team: "チームA",
      slack_id: "U1",
    },
    { id: 2, name: "佐藤", class: "public", team: null, slack_id: "" },
  ];

  beforeEach(() => {
    rpc.mockReset();
    createServerSupabase.mockClear();
    createServerSupabase.mockReturnValue({ rpc });
    getCachedProfileInfo.mockReset();
    getCachedProfileInfo.mockResolvedValue({
      profileInfo: { id: 99, class: "admin" },
    });
  });

  it("保存する人のプロフィールで権限を確認する", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await bulkUpdateProfiles(updates);

    expect(getCachedProfileInfo).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["teamleader", "accounting", "public"])(
    "admin 以外（%s）は、入力チェック・書き込みをせずに保存の権限エラーを返す（送った名前も返さない）",
    async (profileClass) => {
      getCachedProfileInfo.mockResolvedValue({
        profileInfo: { id: 5, class: profileClass },
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // 自分の Slack ID だけの変更（RLS 上は admin 以外でも書き込める）も拒否する
      const ownSlackId = await bulkUpdateProfiles([
        { id: 5, name: "自分", class: "public", team: null, slack_id: "U5" },
      ]);
      // 入力エラーのある内容でも、入力チェックのメッセージ（送った名前）を返さない
      const invalid = await bulkUpdateProfiles([{ ...updates[0], team: null }]);

      for (const result of [ownSlackId, invalid]) {
        expect(result.error?.kind).toBe("forbidden");
        expect(result.error?.message).toContain("保存する権限がありません");
        expect(result.error?.message).not.toContain("山田");
      }
      // ログも閲覧ではなく保存の権限エラーとして残す
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("保存する権限がありません"),
      );
      expect(consoleError).not.toHaveBeenCalledWith(
        expect.stringContaining("閲覧権限"),
      );
      expect(createServerSupabase).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      consoleError.mockRestore();
    },
  );

  it("権限を確認できなければ、書き込みをせずにエラーを返す", async () => {
    getCachedProfileInfo.mockResolvedValue({
      error: new Error("ユーザー認証情報の取得に失敗しました。"),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await bulkUpdateProfiles(updates);

    expect(result.error?.kind).toBe("fetchFailed");
    expect(result.error?.message).toContain("何も保存しませんでした");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("変更した行の権限・チーム・Slack ID を update_profiles に 1 回で渡し、成功なら error を返さない", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await bulkUpdateProfiles(updates);

    expect(result).toEqual({});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("update_profiles", {
      // name は書き込まない。空文字の Slack ID は未設定（null）にする
      p_updates: [
        { id: 1, class: "teamleader", team: "チームA", slack_id: "U1" },
        { id: 2, class: "public", team: null, slack_id: null },
      ],
    });
  });

  it("変更が無ければ RPC を呼ばない", async () => {
    expect(await bulkUpdateProfiles([])).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it("入力エラー（権限が空・teamleader のチームが空）があれば RPC を呼ばずに拒否する", async () => {
    const result = await bulkUpdateProfiles([
      { ...updates[0], team: null },
      { ...updates[1], class: null },
    ]);

    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain(
      "山田: チームリーダーはチームが必須です。",
    );
    expect(result.error?.message).toContain("佐藤: 権限を選択してください。");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      "NOT_APPLIED（RLS で弾かれた・存在しない行がある）",
      { message: "NOT_APPLIED" },
    ],
    [
      "RLS 違反（42501）",
      {
        message:
          'new row violates row-level security policy for table "profiles"',
        code: "42501",
      },
    ],
  ])(
    "%s は、何も保存していないことを利用者に分かるメッセージに変換する",
    async (_label, rpcError) => {
      rpc.mockResolvedValue({ data: null, error: rpcError });

      const result = await bulkUpdateProfiles(updates);

      expect(result.error?.kind).toBe("validationFailed");
      expect(result.error?.message).toContain("何も保存しませんでした");
      expect(result.error?.message).not.toContain("NOT_APPLIED");
    },
  );

  it("不正な入力（INVALID_INPUT）は、何も保存していないことを利用者に分かるメッセージに変換する", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "INVALID_INPUT", code: "22023" },
    });

    const result = await bulkUpdateProfiles(updates);

    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain("入力内容が正しくない");
    expect(result.error?.message).toContain("何も保存しませんでした");
    expect(result.error?.message).not.toContain("INVALID_INPUT");
  });

  it("SQLSTATE 22023 でも INVALID_INPUT 以外の失敗は、入力の不正として扱わない", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    rpc.mockResolvedValue({
      data: null,
      error: { message: "invalid parameter value", code: "22023" },
    });

    const result = await bulkUpdateProfiles(updates);

    expect(result.error?.kind).toBe("fetchFailed");
    expect(result.error?.message).toContain("何も保存されていません");
    consoleError.mockRestore();
  });

  it("権限が許可値以外なら RPC を呼ばずに拒否する", async () => {
    const result = await bulkUpdateProfiles([
      { ...updates[1], class: "superuser" },
    ]);

    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain("佐藤: 権限の値が正しくありません。");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("それ以外の失敗も例外にせず、何も保存されていないことを返す", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await bulkUpdateProfiles(updates);

    expect(result.error?.kind).toBe("fetchFailed");
    expect(result.error?.message).toContain("何も保存されていません");
    consoleError.mockRestore();
  });
});
