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
  class: "teamleader",
  team: "チームA",
  slack_id: "U1",
  ...overrides,
});

describe("toProfileDbRow", () => {
  it("書き込むのは id・権限・チーム・Slack ID だけで、空文字は null にする", () => {
    expect(toProfileDbRow(user({ team: "", slack_id: "" }))).toEqual({
      id: 1,
      class: "teamleader",
      team: null,
      slack_id: null,
    });
  });
});

describe("isUserChanged", () => {
  it.each([
    ["権限", { class: "admin" }],
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
      user({ id: 2, class: "public", team: null }),
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

  it("権限は選択肢（public / teamleader / accounting / admin）のいずれか", () => {
    expect(validateUserUpdates([user({ class: "superuser" })]).get(1)).toEqual({
      class: "権限の値が正しくありません。",
    });
  });

  it("teamleader はチームが必須", () => {
    expect(validateUserUpdates([user({ team: null })]).get(1)).toEqual({
      team: "チームリーダーはチームが必須です。",
    });
  });

  it("teamleader 以外はチームが空でもよく、エラーの無い行は含めない", () => {
    const errors = validateUserUpdates([
      user({ id: 1 }),
      user({ id: 2, class: "public", team: null }),
      user({ id: 3, class: "admin", team: null }),
    ]);

    expect(errors.size).toBe(0);
  });
});

describe("formatUserValidationErrors", () => {
  it("エラーのある行を「名前: 内容」の一覧にする", () => {
    const rows = [
      user({ id: 1, name: "山田", team: null }),
      user({ id: 2, name: "佐藤" }),
      user({ id: 3, name: "鈴木", class: "" }),
    ];

    expect(formatUserValidationErrors(rows, validateUserUpdates(rows))).toEqual(
      [
        "山田: チームリーダーはチームが必須です。",
        "鈴木: 権限を選択してください。",
      ],
    );
  });
});
