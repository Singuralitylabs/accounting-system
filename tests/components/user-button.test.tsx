// @vitest-environment jsdom

import {
  fireEvent,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
      screen.getByRole("button", { name: /ユーザーメニュー/ }),
    ).toBeInTheDocument();
  });

  it("クリックでメニューが開き、ユーザー名とメールアドレス、ログアウトが表示される", async () => {
    renderWithMantine(
      <UserButton
        user={mockUser}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ユーザーメニュー/ }));

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

    const trigger = screen.getByRole("button", { name: /ユーザーメニュー/ });
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

    fireEvent.click(screen.getByRole("button", { name: /ユーザーメニュー/ }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "ログアウト" }),
    );

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("名前が無くメールのみのユーザーでは、メニュー内の表示名がメールになりメール行は重複表示されない", async () => {
    const mockUserEmailOnly = {
      id: "user-3",
      email: "emailonly@future-tech-association.org",
      user_metadata: {},
    } as unknown as User;

    renderWithMantine(
      <UserButton
        user={mockUserEmailOnly}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ユーザーメニュー/ }));

    expect(
      await screen.findByRole("menuitem", { name: "ログアウト" }),
    ).toBeInTheDocument();
    const menu = screen.getByRole("menu");
    expect(menu.textContent).toBe(
      "emailonly@future-tech-association.orgログアウト",
    );
  });

  it("名前がメールアドレスと同じ文字列のユーザーでは、メール行が重複表示されない", async () => {
    const mockUserNameEqualsEmail = {
      id: "user-4",
      email: "same@future-tech-association.org",
      user_metadata: { name: "same@future-tech-association.org" },
    } as unknown as User;

    renderWithMantine(
      <UserButton
        user={mockUserNameEqualsEmail}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ユーザーメニュー/ }));

    expect(
      await screen.findByRole("menuitem", { name: "ログアウト" }),
    ).toBeInTheDocument();
    const menu = screen.getByRole("menu");
    expect(menu.textContent).toBe("same@future-tech-association.orgログアウト");
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

  it("avatar_url の画像読み込みがハイドレート後に失敗した場合も名前のイニシャルにフォールバックする", () => {
    renderWithMantine(
      <UserButton
        user={mockUser}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.error(screen.getByAltText("テストユーザー"));

    expect(screen.getByText("テ")).toBeInTheDocument();
  });

  it("SSR ハイドレート前に既に読み込み失敗していた画像もイニシャルにフォールバックする（ハイドレーション競合の回帰）", () => {
    // jsdom は実際の画像読み込みを行わないため、ハイドレート時点で
    // 既に読み込み失敗済みの img（complete: true / naturalWidth: 0）を
    // HTMLImageElement.prototype 経由で再現する。
    vi.spyOn(
      window.HTMLImageElement.prototype,
      "complete",
      "get",
    ).mockReturnValue(true);
    vi.spyOn(
      window.HTMLImageElement.prototype,
      "naturalWidth",
      "get",
    ).mockReturnValue(0);

    renderWithMantine(
      <UserButton
        user={mockUser}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("テ")).toBeInTheDocument();
  });
});
