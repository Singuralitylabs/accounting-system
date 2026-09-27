// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserList from "@/app/components/UserList";
import type { ProfilesType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { getSelectOptions, viewport } = vi.hoisted(() => ({
  getSelectOptions: vi.fn(),
  viewport: { width: 1024 },
}));

// チームの選択肢は props で受け取るため、行ごとの取得（Server Action）は走らない
vi.mock("@/app/utils/supabase/selectOptions", () => ({ getSelectOptions }));
vi.mock("@/app/utils/supabase/updateProfile", () => ({ default: vi.fn() }));

vi.mock("@mantine/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/hooks")>();
  return {
    ...actual,
    useViewportSize: () => ({ width: viewport.width, height: 800 }),
  };
});

const makeUser = (overrides: Partial<ProfilesType>): ProfilesType => ({
  id: 1,
  user_id: "00000000-0000-0000-0000-000000000001",
  name: "山田太郎",
  email: "taro@future-tech-association.org",
  class: "teamleader",
  team: "チームA",
  slack_id: "U000001",
  inserted_at: "2026-01-01T00:00:00+09:00",
  updated_at: "2026-01-01T00:00:00+09:00",
  ...overrides,
});

const userList = [
  makeUser({}),
  makeUser({
    id: 2,
    user_id: "00000000-0000-0000-0000-000000000002",
    name: "佐藤花子",
    email: "hanako@future-tech-association.org",
    team: "チームB",
  }),
];
const teamList = ["チームA", "チームB"];

describe("UserList", () => {
  beforeEach(() => {
    getSelectOptions.mockReset();
  });

  it.each([
    ["PC（テーブル）", 1024],
    ["モバイル（カード）", 375],
  ])(
    "%s: 初回描画からチームが表示され、行ごとの選択肢取得は行わない",
    (_label, width) => {
      viewport.width = width;
      renderWithMantine(<UserList userList={userList} teamList={teamList} />);

      // Select は value が data に無いと表示欄が空になる（hidden input には値が入る）ため、
      // 表示用の input の値で確認する
      const teamInputs = screen.getAllByPlaceholderText("チームを選択");
      expect(
        teamInputs.map((input) => (input as HTMLInputElement).value),
      ).toEqual(["チームA", "チームB"]);
      expect(getSelectOptions).not.toHaveBeenCalled();
    },
  );
});
