// @vitest-environment jsdom

import {
  fireEvent,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import UserButton from "@/app/components/buttons/user-button";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const mockUser = {
  id: "user-1",
  email: "member@future-tech-association.org",
  user_metadata: {
    name: "テストユーザー",
    avatar_url: "https://example.com/avatar.png",
  },
} as unknown as User;

const mockUserWithoutAvatar = {
  id: "user-2",
  email: "noavatar@future-tech-association.org",
  user_metadata: {
    name: "アバター無しユーザー",
  },
} as unknown as User;

describe("UserButton", () => {
  it("ローディング表示を出さず、トリガーにユーザー名テキストを描画しない", () => {
    renderWithMantine(
      <UserButton
        user={mockUser}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("テストユーザー")).toBeNull();
    expect(
      screen.getByRole("button", { name: "ユーザーメニュー" }),
    ).toBeInTheDocument();
  });

  it("クリックでメニューが開き、ユーザー名とメールアドレス、ログアウトが表示される", async () => {
    renderWithMantine(
      <UserButton
        user={mockUser}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }));

    expect(
      await screen.findByRole("menuitem", { name: "ログアウト" }),
    ).toBeInTheDocument();
    expect(screen.getByText("テストユーザー")).toBeInTheDocument();
    expect(
      screen.getByText("member@future-tech-association.org"),
    ).toBeInTheDocument();
  });

  it("トリガーの再クリックでメニューが閉じる", async () => {
    renderWithMantine(
      <UserButton
        user={mockUser}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const trigger = screen.getByRole("button", { name: "ユーザーメニュー" });
    fireEvent.click(trigger);
    expect(
      await screen.findByRole("menuitem", { name: "ログアウト" }),
    ).toBeInTheDocument();

    fireEvent.click(trigger);

    await waitForElementToBeRemoved(() =>
      screen.queryByRole("menuitem", { name: "ログアウト" }),
    );
  });

  it("ログアウト項目のクリックで onSignOut が呼ばれる", async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    renderWithMantine(<UserButton user={mockUser} onSignOut={onSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "ログアウト" }),
    );

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("avatar_url が無いユーザーでは名前のイニシャルがフォールバック表示される", () => {
    renderWithMantine(
      <UserButton
        user={mockUserWithoutAvatar}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("ア")).toBeInTheDocument();
  });

  it("avatar_url の画像読み込みに失敗した場合も名前のイニシャルにフォールバックする", () => {
    renderWithMantine(
      <UserButton
        user={mockUser}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const img = screen
      .getByRole("button", { name: "ユーザーメニュー" })
      .querySelector("img")!;
    fireEvent.error(img);

    expect(screen.getByText("テ")).toBeInTheDocument();
  });
});
