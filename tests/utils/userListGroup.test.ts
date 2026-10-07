import { describe, expect, it } from "vitest";
import {
  TEAM_COLOR_PALETTE,
  groupUsersByRole,
  teamRowColor,
} from "@/app/utils/userListGroup";

const user = (id: number, userClass: string | null) => ({
  id,
  class: userClass,
});

describe("groupUsersByRole", () => {
  it("admin → accounting → public → 未設定の順にセクション化し、teamleader のセクションは作らない", () => {
    const sections = groupUsersByRole([
      user(1, "public"),
      user(2, "admin"),
      user(3, "teamleader"),
      user(4, "accounting"),
      user(5, "public"),
    ]);

    expect(sections.map((s) => [s.key, s.label, s.users.length])).toEqual([
      ["admin", "管理者", 1],
      ["accounting", "経理", 1],
      ["public", "メンバー", 2],
      ["unset", "未設定", 1],
    ]);
  });

  it("チームリーダーのフラグが付いた経理ユーザーも経理セクションに入る", () => {
    const sections = groupUsersByRole([
      { id: 1, class: "accounting", is_teamleader: true },
      { id: 2, class: "public", is_teamleader: true },
    ]);

    expect(sections.map((s) => [s.key, s.users.map((u) => u.id)])).toEqual([
      ["accounting", [1]],
      ["public", [2]],
    ]);
  });

  it("権限が未設定・不正な値のユーザーは末尾の「未設定」にまとめる", () => {
    const sections = groupUsersByRole([
      user(1, null),
      user(2, "public"),
      user(3, "superuser"),
      user(4, ""),
    ]);

    expect(sections.map((s) => s.key)).toEqual(["public", "unset"]);
    expect(sections[1].label).toBe("未設定");
    expect(sections[1].users.map((u) => u.id)).toEqual([1, 3, 4]);
  });

  it("該当者がいない権限のセクションは作らない", () => {
    expect(groupUsersByRole([])).toEqual([]);
    expect(groupUsersByRole([user(1, "admin")]).map((s) => s.key)).toEqual([
      "admin",
    ]);
  });

  it("セクション内は入力の並び順を保つ", () => {
    const sections = groupUsersByRole([
      user(3, "public"),
      user(1, "public"),
      user(2, "public"),
    ]);

    expect(sections[0].users.map((u) => u.id)).toEqual([3, 1, 2]);
  });

  it("sectionRoleOf を渡すと、その権限でセクションを決める（編集中の行を保存済みのセクションに残すため）", () => {
    const edited = [user(1, "admin"), user(2, "public")];
    const saved = new Map([
      [1, "public"],
      [2, "public"],
    ]);

    const sections = groupUsersByRole(edited, (u) => saved.get(u.id) ?? null);

    expect(sections.map((s) => s.key)).toEqual(["public"]);
    expect(sections[0].users).toHaveLength(2);
  });
});

describe("teamRowColor", () => {
  const teamList = ["A", "B", "C"];

  it("チームの表示順にパレットの色を割り当てる", () => {
    expect(teamRowColor("A", teamList)).toBe(TEAM_COLOR_PALETTE[0]);
    expect(teamRowColor("B", teamList)).toBe(TEAM_COLOR_PALETTE[1]);
    expect(teamRowColor("C", teamList)).toBe(TEAM_COLOR_PALETTE[2]);
  });

  it("選択肢に無いチーム・チーム未設定は色を付けない", () => {
    expect(teamRowColor("旧チーム", teamList)).toBeUndefined();
    expect(teamRowColor(null, teamList)).toBeUndefined();
    expect(teamRowColor("", teamList)).toBeUndefined();
  });

  it("チーム数がパレットの色数を超えたら先頭の色から使い回す", () => {
    const many = Array.from(
      { length: TEAM_COLOR_PALETTE.length + 2 },
      (_, i) => `T${i}`,
    );

    expect(teamRowColor(many[TEAM_COLOR_PALETTE.length], many)).toBe(
      TEAM_COLOR_PALETTE[0],
    );
    expect(teamRowColor(many[TEAM_COLOR_PALETTE.length + 1], many)).toBe(
      TEAM_COLOR_PALETTE[1],
    );
  });

  it("隣り合うチームの色は異なる", () => {
    expect(teamRowColor("A", teamList)).not.toBe(teamRowColor("B", teamList));
  });
});
