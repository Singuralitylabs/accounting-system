import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  // 実際の redirect() と同じく、呼ばれたら以降を実行しない（throw する）
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

import DashboardPage from "@/app/dashboard/page";

describe("/dashboard", () => {
  it("ユーザー管理（/dashboard/users）へリダイレクトする", () => {
    expect(() => DashboardPage()).toThrow("NEXT_REDIRECT:/dashboard/users");
    expect(redirect).toHaveBeenCalledWith("/dashboard/users");
  });
});
