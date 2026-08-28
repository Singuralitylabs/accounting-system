// @vitest-environment jsdom

import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import Header from "@/app/components/Header";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const mockPush = vi.fn();
const mockGetUser = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignOut = vi.fn();
const mockGetProfileInfoById = vi.fn();

let authStateCallback:
  | ((event: string, session: { user: User } | null) => void)
  | undefined;

const mockSupabase = {
  auth: {
    getUser: mockGetUser,
    onAuthStateChange: (...args: unknown[]) => {
      mockOnAuthStateChange(...args);
      authStateCallback = args[0] as (
        event: string,
        session: { user: User } | null,
      ) => void;
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    },
    signOut: mockSignOut,
  },
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/matters",
}));

vi.mock("@/app/components/providers/SupabaseProvider", () => ({
  useSupabase: () => ({ supabase: mockSupabase }),
}));

vi.mock("@/app/utils/supabase/profiles", () => ({
  getProfileInfoById: (...args: unknown[]) => mockGetProfileInfoById(...args),
}));

vi.mock("@/app/components/MobileHeader", () => ({
  default: () => <div data-testid="mobile-header" />,
}));

let capturedOnSignOut: (() => Promise<void>) | undefined;

vi.mock("@/app/components/buttons/user-button", () => ({
  default: ({
    user,
    onSignOut,
  }: {
    user: { user_metadata?: { name?: string }; email?: string } | null;
    onSignOut: () => Promise<void>;
  }) => {
    capturedOnSignOut = onSignOut;
    return (
      <div>
        <span>{user?.user_metadata?.name || user?.email}</span>
        <button type="button" onClick={() => onSignOut()}>
          logout-test
        </button>
      </div>
    );
  },
}));

const initialUser = {
  id: "user-1",
  email: "member@future-tech-association.org",
  user_metadata: {
    name: "初期ユーザー",
    avatar_url: "https://example.com/avatar.png",
  },
} as unknown as User;

const initialProfile = {
  id: 1,
  user_id: "user-1",
  class: "public",
  name: "初期ユーザー",
  email: "member@future-tech-association.org",
  team: null,
  slack_id: null,
  inserted_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

describe("Header", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetUser.mockReset();
    mockOnAuthStateChange.mockReset();
    mockSignOut.mockReset();
    mockGetProfileInfoById.mockReset();
    authStateCallback = undefined;
    capturedOnSignOut = undefined;
    vi.useFakeTimers();

    mockGetProfileInfoById.mockResolvedValue({
      profileInfo: {
        ...initialProfile,
        name: "更新後ユーザー",
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("描画時に supabase.auth.getUser を呼ばない", () => {
    renderWithMantine(
      <Header initialUser={initialUser} initialProfile={initialProfile} />,
    );

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(screen.getByText("初期ユーザー")).toBeInTheDocument();
  });

  it("onAuthStateChange のコールバック内で getUser を呼ばず session.user から更新する", async () => {
    renderWithMantine(
      <Header initialUser={initialUser} initialProfile={initialProfile} />,
    );

    const sessionUser = {
      id: "user-2",
      email: "other@future-tech-association.org",
      user_metadata: {
        name: "セッションユーザー",
        avatar_url: "https://example.com/other.png",
      },
    } as unknown as User;

    await act(async () => {
      authStateCallback?.("SIGNED_IN", { user: sessionUser });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockGetProfileInfoById).toHaveBeenCalledWith("user-2");
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(screen.getByText("セッションユーザー")).toBeInTheDocument();
  });

  it("認証イベントが複数回発火しても onAuthStateChange の購読は張り替わらない", async () => {
    renderWithMantine(
      <Header initialUser={initialUser} initialProfile={initialProfile} />,
    );

    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);

    const sessionUser1 = {
      id: "user-2",
      email: "other@future-tech-association.org",
      user_metadata: { name: "ユーザー2" },
    } as unknown as User;

    const sessionUser2 = {
      id: "user-3",
      email: "third@future-tech-association.org",
      user_metadata: { name: "ユーザー3" },
    } as unknown as User;

    await act(async () => {
      authStateCallback?.("SIGNED_IN", { user: sessionUser1 });
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      authStateCallback?.("TOKEN_REFRESHED", { user: sessionUser2 });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("ユーザー3")).toBeInTheDocument();
  });

  it("handleSignOut が signOut を呼び出して /login へ遷移する", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    renderWithMantine(
      <Header initialUser={initialUser} initialProfile={initialProfile} />,
    );

    await act(async () => {
      await capturedOnSignOut?.();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/login");
  });
});
