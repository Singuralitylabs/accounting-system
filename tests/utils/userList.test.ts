import { describe, expect, it } from "vitest";
import {
  formatUserValidationErrors,
  isUserChanged,
  selectChangedUsers,
  toProfileDbRow,
  validateUserUpdates,
  type ProfileUpdateInput,
} from "@/app/utils/userList";

const user = (overrides: Partial<ProfileUpdateInput>): ProfileUpdateInput => ({
  id: 1,
  name: "山田太郎",
  class: "public",
  is_teamleader: true,
  team: "チームA",
  slack_id: "U1",
  ...overrides,
});

describe("toProfileDbRow", () => {
  it("書き込むのは id・権限・チームリーダー・チーム・Slack ID だけで、空文字は null にする", () => {
    expect(toProfileDbRow(user({ team: "", slack_id: "" }))).toEqual({
      id: 1,
      class: "public",
      is_teamleader: true,
      team: null,
      slack_id: null,
    });
  });

  it("チームリーダーのフラグは boolean で出力し、未指定相当は false にする", () => {
    expect(toProfileDbRow(user({ is_teamleader: false })).is_teamleader).toBe(
      false,
    );
    expect(
      toProfileDbRow(user({ is_teamleader: undefined as unknown as boolean }))
        .is_teamleader,
    ).toBe(false);
  });
});

describe("isUserChanged", () => {
  it.each([
    ["権限", { class: "admin" }],
    ["チームリーダー", { is_teamleader: false }],
    ["チーム", { team: "チームB" }],
    ["Slack ID", { slack_id: "U2" }],
  ])("%s が変われば変更あり", (_label, overrides) => {
    expect(isUserChanged(user({}), user(overrides))).toBe(true);
  });

  it("名前などの書き込まない項目や、空文字と null の違いは変更に数えない", () => {
    expect(
      isUserChanged(user({ slack_id: null }), user({ slack_id: "" })),
    ).toBe(false);
    expect(isUserChanged(user({}), user({ name: "別名" }))).toBe(false);
  });
});

describe("selectChangedUsers", () => {
  it("baseline から変わった行だけを、元の並び順で返す", () => {
    const baseline = new Map([
      [1, user({ id: 1 })],
      [2, user({ id: 2 })],
      [3, user({ id: 3 })],
    ]);
    const rows = [
      user({ id: 3, slack_id: "U3" }),
      user({ id: 1 }),
      user({ id: 2, is_teamleader: false, team: null }),
    ];

    expect(selectChangedUsers(rows, baseline).map((row) => row.id)).toEqual([
      3, 2,
    ]);
  });
});

describe("validateUserUpdates", () => {
  it("権限は必須", () => {
    expect(validateUserUpdates([user({ class: null })]).get(1)).toEqual({
      class: "権限を選択してください。",
    });
  });

  it("権限は選択肢（public / accounting / admin）のいずれか", () => {
    expect(validateUserUpdates([user({ class: "superuser" })]).get(1)).toEqual({
      class: "権限の値が正しくありません。",
    });
  });

  it("teamleader は権限の値としては不正", () => {
    expect(validateUserUpdates([user({ class: "teamleader" })]).get(1)).toEqual(
      {
        class: "権限の値が正しくありません。",
      },
    );
  });

  it("チームリーダーのフラグが付いた行はチームが必須", () => {
    expect(validateUserUpdates([user({ team: null })]).get(1)).toEqual({
      team: "チームリーダーはチームが必須です。",
    });
  });

  it("経理・管理者でもフラグが付いていればチームが必須で、チームがあれば有効", () => {
    expect(
      validateUserUpdates([
        user({ id: 1, class: "accounting", team: "チームA" }),
        user({ id: 2, class: "admin", team: "チームB" }),
      ]).size,
    ).toBe(0);
    const errors = validateUserUpdates([
      user({ id: 3, class: "accounting", team: null }),
      user({ id: 4, class: "admin", team: "" }),
    ]);
    expect(errors.get(3)).toEqual({
      team: "チームリーダーはチームが必須です。",
    });
    expect(errors.get(4)).toEqual({
      team: "チームリーダーはチームが必須です。",
    });
  });

  it("権限未設定でフラグ付き・チームなしなら権限とチームの両方がエラー", () => {
    expect(
      validateUserUpdates([user({ class: null, team: null })]).get(1),
    ).toEqual({
      class: "権限を選択してください。",
      team: "チームリーダーはチームが必須です。",
    });
  });

  it("フラグが無ければチームが空でもよく、エラーの無い行は含めない", () => {
    const errors = validateUserUpdates([
      user({ id: 1 }),
      user({ id: 2, is_teamleader: false, team: null }),
      user({ id: 3, class: "admin", is_teamleader: false, team: null }),
    ]);

    expect(errors.size).toBe(0);
  });
});

describe("formatUserValidationErrors", () => {
  it("エラーのある行を「名前: 内容」の一覧にする", () => {
    const rows = [
      user({ id: 1, name: "山田", team: null }),
      user({ id: 2, name: "佐藤" }),
      user({ id: 3, name: "鈴木", class: "", is_teamleader: false }),
    ];

    expect(formatUserValidationErrors(rows, validateUserUpdates(rows))).toEqual(
      [
        "山田: チームリーダーはチームが必須です。",
        "鈴木: 権限を選択してください。",
      ],
    );
  });
});
