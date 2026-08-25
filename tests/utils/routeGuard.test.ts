import { describe, expect, it } from "vitest";
import {
  AuthApiError,
  AuthError,
  AuthRetryableFetchError,
} from "@supabase/supabase-js";
import {
  classifyPath,
  isAuthRoute,
  isPublicSkipPath,
  isTransientAuthError,
  matchesRoute,
} from "@/app/utils/routeGuard";

describe("matchesRoute", () => {
  it("完全一致する", () => {
    expect(matchesRoute("/team", "/team")).toBe(true);
    expect(matchesRoute("/accounting", "/accounting")).toBe(true);
  });

  it("配下パスにマッチする", () => {
    expect(matchesRoute("/team/sub", "/team")).toBe(true);
    expect(matchesRoute("/dashboard/users", "/dashboard")).toBe(true);
  });

  it("前方一致の別パスにはマッチしない", () => {
    expect(matchesRoute("/teamX", "/team")).toBe(false);
    expect(matchesRoute("/accounting2", "/accounting")).toBe(false);
    expect(matchesRoute("/profit-loss-x", "/profit-loss")).toBe(false);
  });

  it("route が / のとき配下にはマッチしない（startsWith('//') になるため）", () => {
    expect(matchesRoute("/", "/")).toBe(true);
    expect(matchesRoute("/matters", "/")).toBe(false);
  });
});

describe("isTransientAuthError", () => {
  it("AuthRetryableFetchError は一時的障害", () => {
    expect(
      isTransientAuthError(new AuthRetryableFetchError("network", 0)),
    ).toBe(true);
  });

  it("AuthApiError の 5xx は一時的障害（500 含む）", () => {
    expect(isTransientAuthError(new AuthApiError("oops", 500, "500"))).toBe(
      true,
    );
    expect(isTransientAuthError(new AuthApiError("oops", 502, "502"))).toBe(
      true,
    );
    expect(isTransientAuthError(new AuthApiError("oops", 503, "503"))).toBe(
      true,
    );
    expect(isTransientAuthError(new AuthApiError("oops", 504, "504"))).toBe(
      true,
    );
  });

  it("401 / 403 など 5xx 以外の AuthApiError は一時的障害ではない", () => {
    expect(
      isTransientAuthError(new AuthApiError("unauthorized", 401, "401")),
    ).toBe(false);
    expect(
      isTransientAuthError(new AuthApiError("forbidden", 403, "403")),
    ).toBe(false);
  });

  it("素の AuthError は一時的障害ではない", () => {
    expect(isTransientAuthError(new AuthError("generic"))).toBe(false);
  });
});

describe("isPublicSkipPath / isAuthRoute", () => {
  it("静的ファイル・/_next・/api・/auth/ は認証スキップ", () => {
    expect(isPublicSkipPath("/favicon.ico")).toBe(true);
    expect(isPublicSkipPath("/logo.png")).toBe(true);
    expect(isPublicSkipPath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicSkipPath("/api/health")).toBe(true);
    expect(isPublicSkipPath("/auth/callback")).toBe(true);
  });

  it("/auth-error は /auth/ ではないのでスキップ対象外", () => {
    expect(isPublicSkipPath("/auth-error")).toBe(false);
  });

  it("/login とその配下は認証画面", () => {
    expect(isAuthRoute("/login")).toBe(true);
    expect(isAuthRoute("/login/reset")).toBe(true);
    expect(isAuthRoute("/matters")).toBe(false);
  });
});

describe("classifyPath（public / protected / restricted）", () => {
  it("認証不要で通過するパス", () => {
    expect(classifyPath("/auth/callback")).toEqual({ kind: "public_skip" });
    expect(classifyPath("/auth-error")).toEqual({ kind: "open" });
  });

  it("/login 配下は保護ルートより auth_route を優先する（現行表に /login 制限は無い）", () => {
    expect(classifyPath("/login")).toEqual({ kind: "auth_route" });
    expect(classifyPath("/login/reset")).toEqual({ kind: "auth_route" });
  });

  it("ロール制限なしのログイン必須", () => {
    expect(classifyPath("/")).toEqual({ kind: "auth_only" });
    expect(classifyPath("/new")).toEqual({ kind: "auth_only" });
    expect(classifyPath("/matters")).toEqual({ kind: "auth_only" });
    expect(classifyPath("/matters/1")).toEqual({ kind: "auth_only" });
  });

  it("ロール制限ルートと許可ロール", () => {
    expect(classifyPath("/team")).toEqual({
      kind: "restricted",
      route: "/team",
      allowed: ["teamleader", "admin"],
    });
    expect(classifyPath("/accounting")).toEqual({
      kind: "restricted",
      route: "/accounting",
      allowed: ["accounting", "admin"],
    });
    expect(classifyPath("/profit-loss")).toEqual({
      kind: "restricted",
      route: "/profit-loss",
      allowed: ["teamleader", "accounting", "admin"],
    });
    expect(classifyPath("/recurring-costs")).toEqual({
      kind: "restricted",
      route: "/recurring-costs",
      allowed: ["accounting", "admin"],
    });
    expect(classifyPath("/extra-entries")).toEqual({
      kind: "restricted",
      route: "/extra-entries",
      allowed: ["accounting", "admin"],
    });
    expect(classifyPath("/dashboard")).toEqual({
      kind: "restricted",
      route: "/dashboard",
      allowed: ["admin"],
    });
    expect(classifyPath("/dashboard/users")).toEqual({
      kind: "restricted",
      route: "/dashboard",
      allowed: ["admin"],
    });
    expect(classifyPath("/team/sub")).toEqual({
      kind: "restricted",
      route: "/team",
      allowed: ["teamleader", "admin"],
    });
    expect(classifyPath("/teamX")).toEqual({ kind: "open" });
  });
});
