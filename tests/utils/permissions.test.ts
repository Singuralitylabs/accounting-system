import { describe, expect, it } from "vitest";
import {
  hasClassAccess,
  visibleNavItems,
  ROUTE_PERMISSIONS,
  AUTH_ONLY_ROUTES,
  isAuthOnlyPath,
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
    ["/matters/team", "teamleader", true],
    ["/matters/team", "accounting", false],
    ["/matters/accounting", "accounting", true],
    ["/matters/accounting", "teamleader", false],
    // 旧 URL。許可ロールは新 URL と同一（リダイレクト前の保護を維持するため残す）
    ["/team", "teamleader", true],
    ["/team", "accounting", false],
    ["/accounting", "accounting", true],
    ["/accounting", "teamleader", false],
    ["/profit-loss", "teamleader", true],
    ["/profit-loss", "accounting", true],
    ["/profit-loss", "public", false],
    ["/recurring-costs", "accounting", true],
    ["/recurring-costs", "teamleader", false],
    ["/extra-entries", "accounting", true],
    ["/extra-entries", "teamleader", false],
    ["/budget-declarations", "teamleader", true],
    ["/budget-declarations", "accounting", true],
    ["/budget-declarations", "public", false],
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

describe("AUTH_ONLY_ROUTES / isAuthOnlyPath", () => {
  it("ログイン必須ルートは /, /new, /matters である", () => {
    expect(AUTH_ONLY_ROUTES).toEqual(["/", "/new", "/matters"]);
  });

  it.each([
    ["/", true],
    ["/new", true],
    ["/new/confirm", true],
    ["/matters", true],
    ["/matters/1", true],
    ["/login", false],
    ["/dashboard", false],
    ["/team", false],
    ["/matter", false],
    ["/mattersome", false],
    ["/newest", false],
  ])("%s はログイン必須判定が %s", (pathname, expected) => {
    expect(isAuthOnlyPath(pathname)).toBe(expected);
  });
});

describe("visibleNavItems", () => {
  const hrefsFor = (profileClass: string | null | undefined) =>
    visibleNavItems(profileClass).map((item) => item.href);

  // 新規作成・チーム案件・経理用一覧は案件カード（/matters）内のタブ・ボタンに、
  // 定期費用マスタ・経理追加収支は損益計算書（/profit-loss）内のボタンに集約したため、
  // トップページ／ヘッダーのナビ項目は4つ（案件カード・損益計算書・事前収支申告・管理画面）のみ。
  it("admin には全項目を表示する", () => {
    expect(hrefsFor("admin")).toEqual([
      "/matters",
      "/profit-loss",
      "/budget-declarations",
      "/dashboard",
    ]);
  });

  it("public には案件カードのみ表示する", () => {
    expect(hrefsFor("public")).toEqual(["/matters"]);
  });

  it("teamleader には案件カード・損益計算書・事前収支申告を表示する", () => {
    expect(hrefsFor("teamleader")).toEqual([
      "/matters",
      "/profit-loss",
      "/budget-declarations",
    ]);
  });

  it("accounting には案件カード・損益計算書・事前収支申告を表示する", () => {
    expect(hrefsFor("accounting")).toEqual([
      "/matters",
      "/profit-loss",
      "/budget-declarations",
    ]);
  });

  it("ロールが null の場合は案件カードのみ表示する", () => {
    expect(hrefsFor(null)).toEqual(["/matters"]);
  });

  it("すべてのナビ項目にハブ用の説明文がある", () => {
    const items = visibleNavItems("admin");
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.description.length).toBeGreaterThan(0);
    }
  });
});
