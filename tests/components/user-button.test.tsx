// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import UserButton from "@/app/components/buttons/user-button";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const mockGetUser = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithOAuth = vi.fn();

vi.mock("@/app/components/providers/SupabaseProvider", () => ({
  useSupabase: () => ({
    supabase: {
      auth: {
        getUser: mockGetUser,
        onAuthStateChange: mockOnAuthStateChange,
        signInWithOAuth: mockSignInWithOAuth,
      },
    },
  }),
}));

const mockUser = {
  id: "user-1",
  email: "member@future-tech-association.org",
  user_metadata: {
    name: "テストユーザー",
    avatar_url: "https://example.com/avatar.png",
  },
} as unknown as User;

describe("UserButton", () => {
  it("描画時に supabase.auth.getUser / onAuthStateChange を呼ばない", () => {
    renderWithMantine(
      <UserButton
        user={mockUser}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockOnAuthStateChange).not.toHaveBeenCalled();
  });

  it("ローディング表示を出さず、ユーザー名を即座に描画する", () => {
    renderWithMantine(
      <UserButton
        user={mockUser}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("テストユーザー")).toBeInTheDocument();
  });

  it("user が null のときはログインボタンを出す", () => {
    renderWithMantine(
      <UserButton
        user={null}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByRole("button", { name: "ログイン" }),
    ).toBeInTheDocument();
  });
});
