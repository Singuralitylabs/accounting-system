// @vitest-environment jsdom

import { screen } from "@testing-library/react";
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

describe("UserButton", () => {
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
});
