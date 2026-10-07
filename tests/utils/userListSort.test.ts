import { describe, expect, it } from "vitest";
import { sortUserList } from "@/app/utils/userListSort";

type User = {
  id: number;
  name: string;
  class: string | null;
  is_teamleader: boolean;
  team: string | null;
};

let nextId = 1;
const user = (overrides: Partial<User>): User => ({
  id: nextId++,
  name: "山田",
  class: "public",
  is_teamleader: false,
  team: null,
  ...overrides,
});

const names = (users: User[]) => users.map((u) => u.name);

const teamList = ["開発", "営業", "広報"];

describe("sortUserList", () => {
  it("権限は admin → accounting → public の順で、それ以外の値・未設定は末尾", () => {
    const users = [
      user({ name: "一般", class: "public" }),
      user({ name: "未設定", class: null }),
      user({ name: "不明", class: "guest" }),
      user({ name: "経理", class: "accounting" }),
      user({ name: "管理者", class: "admin" }),
    ];

    const sorted = names(sortUserList(users, teamList));

    expect(sorted.slice(0, 3)).toEqual(["管理者", "経理", "一般"]);
    expect(sorted.slice(3).sort()).toEqual(["不明", "未設定"].sort());
  });

  it("同じ権限の中はチームの表示順（選択肢の順）に並べる", () => {
    const users = [
      user({ name: "A", class: "public", team: "広報" }),
      user({ name: "B", class: "public", team: "開発" }),
      user({ name: "C", class: "public", team: "営業" }),
    ];

    expect(names(sortUserList(users, teamList))).toEqual(["B", "C", "A"]);
  });

  it("選択肢に無いチームは選択肢のチームの後ろ、チーム未設定はさらに後ろに並べる", () => {
    const users = [
      user({ name: "未設定", class: "public", team: null }),
      user({ name: "旧チームB", class: "public", team: "旧チームB" }),
      user({ name: "広報", class: "public", team: "広報" }),
      user({ name: "旧チームA", class: "public", team: "旧チームA" }),
      user({ name: "空文字", class: "public", team: "" }),
      user({ name: "開発", class: "public", team: "開発" }),
    ];

    const sorted = names(sortUserList(users, teamList));

    expect(sorted.slice(0, 4)).toEqual([
      "開発",
      "広報",
      "旧チームA",
      "旧チームB",
    ]);
    expect(sorted.slice(4).sort()).toEqual(["未設定", "空文字"].sort());
  });

  it("権限・チームが同じならば名前の順（日本語の照合順）に並べる", () => {
    const users = [
      user({ name: "わたなべ", class: "public", team: "開発" }),
      user({ name: "いとう", class: "public", team: "開発" }),
      user({ name: "かとう", class: "public", team: "開発" }),
    ];

    expect(names(sortUserList(users, teamList))).toEqual([
      "いとう",
      "かとう",
      "わたなべ",
    ]);
  });

  it("権限・チームリーダー・チーム・名前の優先順で並べ、元の配列は変更しない", () => {
    const users = [
      user({ name: "あ", class: "public", team: "開発" }),
      user({ name: "い", class: "public", is_teamleader: true, team: "広報" }),
      user({ name: "う", class: "public", is_teamleader: true, team: "開発" }),
      user({ name: "え", class: "admin", team: null }),
    ];
    const original = [...users];

    expect(names(sortUserList(users, teamList))).toEqual([
      "え",
      "う",
      "い",
      "あ",
    ]);
    expect(users).toEqual(original);
  });

  it("チームの選択肢が空（取得失敗時）でも、チームありを未設定より前にして並べる", () => {
    const users = [
      user({ name: "未設定", class: "public", team: null }),
      user({ name: "営業", class: "public", team: "営業" }),
      user({ name: "開発", class: "public", team: "開発" }),
    ];

    expect(names(sortUserList(users, []))).toEqual(["営業", "開発", "未設定"]);
  });

  it("同じ権限の中ではチームリーダーが先頭に並び、その中でチームの表示順になる", () => {
    const users = [
      user({ name: "一般開発", class: "public", team: "開発" }),
      user({ name: "リーダー広報", is_teamleader: true, team: "広報" }),
      user({ name: "リーダー開発", is_teamleader: true, team: "開発" }),
      user({ name: "一般営業", class: "public", team: "営業" }),
    ];

    expect(names(sortUserList(users, teamList))).toEqual([
      "リーダー開発",
      "リーダー広報",
      "一般開発",
      "一般営業",
    ]);
  });

  it("チームリーダーのフラグは権限の順位を超えず、経理のリーダーも一般より前に並ぶ", () => {
    const users = [
      user({ name: "一般リーダー", is_teamleader: true, team: "開発" }),
      user({
        name: "経理リーダー",
        class: "accounting",
        is_teamleader: true,
        team: "広報",
      }),
      user({ name: "経理", class: "accounting" }),
    ];

    expect(names(sortUserList(users, teamList))).toEqual([
      "経理リーダー",
      "経理",
      "一般リーダー",
    ]);
  });
});
