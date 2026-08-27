// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignIn } from "@/app/components/auth/auth-components";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const mockPush = vi.fn();
const mockNotifyError = vi.fn();
const mockGetUser = vi.fn();
const mockSignOut = vi.fn();
const mockSignInWithOAuth = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/app/utils/notify", () => ({
  notifyError: (...args: unknown[]) => mockNotifyError(...args),
}));

vi.mock("@/app/components/providers/SupabaseProvider", () => ({
  useSupabase: () => ({
    supabase: {
      auth: {
        getUser: mockGetUser,
        signOut: mockSignOut,
        signInWithOAuth: mockSignInWithOAuth,
      },
    },
  }),
}));

describe("SignIn", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockNotifyError.mockReset();
    mockGetUser.mockReset();
    mockSignOut.mockReset();
    mockSignInWithOAuth.mockReset();
  });

  it("Google アイコン付きのログインボタンを出す", () => {
    renderWithMantine(<SignIn />);

    expect(
      screen.getByRole("button", { name: "Google でログイン" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button").querySelector("svg")).not.toBeNull();
  });

  it("クリック後はローディング状態になり、OAuth 開始中は disabled のままにする", async () => {
    let resolveOAuth: ((value: { error: null }) => void) | undefined;
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockSignInWithOAuth.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOAuth = resolve;
        }),
    );

    renderWithMantine(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Google でログイン" }));

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeDisabled();
      expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    });

    resolveOAuth?.({ error: null });

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalled();
    });
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("OAuth エラー時は通知してボタンを再有効化する", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockSignInWithOAuth.mockResolvedValue({
      error: { message: "oauth failed" },
    });

    renderWithMantine(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Google でログイン" }));

    await waitFor(() => {
      expect(mockNotifyError).toHaveBeenCalledWith(
        "ログイン処理でエラーが発生しました。",
      );
    });
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("既存ユーザーが許可ドメインなら / へ遷移する", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: "member@future-tech-association.org" } },
    });

    renderWithMantine(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Google でログイン" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
  });

  it("OAuth 画面から bfcache で戻ったらボタンを再有効化する", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockSignInWithOAuth.mockImplementation(() => new Promise(() => {}));

    renderWithMantine(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Google でログイン" }));

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeDisabled();
    });

    const pageShow = new Event("pageshow");
    Object.defineProperty(pageShow, "persisted", { value: true });
    window.dispatchEvent(pageShow);

    await waitFor(() => {
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  it("既存ユーザーが許可ドメイン外ならサインアウトしてボタンを再有効化する", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: "outsider@example.com" } },
    });
    mockSignOut.mockResolvedValue({ error: null });

    renderWithMantine(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Google でログイン" }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockNotifyError).toHaveBeenCalled();
    });
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });
});
