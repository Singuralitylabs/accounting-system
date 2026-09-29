import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  // Like the real redirect(), stop execution by throwing.
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
