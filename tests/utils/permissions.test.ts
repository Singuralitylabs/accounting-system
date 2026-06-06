import { describe, expect, it } from "vitest";
import {
  hasClassAccess,
  visibleNavItems,
  ROUTE_PERMISSIONS,
} from "@/app/utils/permissions";

describe("hasClassAccess", () => {
  it("許可ロールに含まれる場合は true を返す", () => {
    expect(hasClassAccess(["teamleader", "admin"], "admin")).toBe(true);
    expect(hasClassAccess(["teamleader", "admin"], "teamleader")).toBe(true);
  });

  it("許可ロールに含まれない場合は false を返す", () => {
    expect(hasClassAccess(["teamleader", "admin"], "public")).toBe(false);
    expect(hasClassAccess(["admin"], "accounting")).toBe(false);
  });

  it("ロールが null / undefined / 空文字の場合は false を返す", () => {
    expect(hasClassAccess(["admin"], null)).toBe(false);
    expect(hasClassAccess(["admin"], undefined)).toBe(false);
    expect(hasClassAccess(["admin"], "")).toBe(false);
  });

  it("未知のロール文字列の場合は false を返す", () => {
    expect(hasClassAccess(["admin"], "superuser")).toBe(false);
  });
});

describe("ROUTE_PERMISSIONS による各保護ルートの認可", () => {
  it.each([
    ["/team", "teamleader", true],
    ["/team", "accounting", false],
    ["/accounting", "accounting", true],
    ["/accounting", "teamleader", false],
    ["/profit-loss", "teamleader", true],
    ["/profit-loss", "accounting", true],
    ["/profit-loss", "public", false],
    ["/recurring-costs", "accounting", true],
    ["/recurring-costs", "teamleader", false],
    ["/dashboard", "admin", true],
    ["/dashboard", "accounting", false],
  ])("%s へのアクセス: ロール %s → %s", (route, role, expected) => {
    expect(hasClassAccess(ROUTE_PERMISSIONS[route], role)).toBe(expected);
  });

  it("admin はすべての保護ルートにアクセスできる", () => {
    for (const allowedClasses of Object.values(ROUTE_PERMISSIONS)) {
      expect(hasClassAccess(allowedClasses, "admin")).toBe(true);
    }
  });

  it("public はすべての保護ルートにアクセスできない", () => {
    for (const allowedClasses of Object.values(ROUTE_PERMISSIONS)) {
      expect(hasClassAccess(allowedClasses, "public")).toBe(false);
    }
  });
});

describe("visibleNavItems", () => {
  const hrefsFor = (profileClass: string | null | undefined) =>
    visibleNavItems(profileClass).map((item) => item.href);

  it("admin には全項目を表示する", () => {
    expect(hrefsFor("admin")).toEqual([
      "/",
      "/new",
      "/team",
      "/accounting",
      "/profit-loss",
      "/recurring-costs",
      "/dashboard",
    ]);
  });

  it("public にはロール制限のない項目のみ表示する", () => {
    expect(hrefsFor("public")).toEqual(["/", "/new"]);
  });

  it("teamleader にはチーム案件と損益計算書を表示する", () => {
    expect(hrefsFor("teamleader")).toEqual([
      "/",
      "/new",
      "/team",
      "/profit-loss",
    ]);
  });

  it("accounting には経理用一覧・損益計算書・定期費用マスタを表示する", () => {
    expect(hrefsFor("accounting")).toEqual([
      "/",
      "/new",
      "/accounting",
      "/profit-loss",
      "/recurring-costs",
    ]);
  });

  it("ロールが null の場合はロール制限のない項目のみ表示する", () => {
    expect(hrefsFor(null)).toEqual(["/", "/new"]);
  });
});
