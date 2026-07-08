import { describe, expect, it } from "vitest";
import {
  hasClassAccess,
  visibleNavItems,
  readClassClaim,
  ROUTE_PERMISSIONS,
} from "@/app/utils/permissions";

// テスト用: JWT ペイロードだけを base64url エンコードした「トークン」を組み立てる。
// 署名検証はテスト対象外（呼び出し側で検証済みであることを前提とした関数のため）。
const fakeToken = (payload: unknown): string =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

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
    ["/extra-entries", "accounting", true],
    ["/extra-entries", "teamleader", false],
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

describe("readClassClaim", () => {
  it("accessToken が無い場合は null を返す（DB フォールバック要）", () => {
    expect(readClassClaim(undefined)).toBeNull();
  });

  it("user_class クレームが文字列の場合はその値を返す", () => {
    expect(readClassClaim(fakeToken({ user_class: "admin" }))).toBe("admin");
  });

  it("user_class クレームが明示的に null の場合も null を返す（DB フォールバック要）", () => {
    // OAuth コールバックはトークン発行後に profiles 行を作るため、新規ユーザーの
    // 初回トークンは必ず user_class: null になる。フォールバックしないと、
    // 直後のロール付与が最大約1時間反映されない。
    expect(readClassClaim(fakeToken({ user_class: null }))).toBeNull();
  });

  it("user_class クレーム自体が無い場合は null を返す（DB フォールバック要）", () => {
    expect(readClassClaim(fakeToken({ sub: "user-1" }))).toBeNull();
  });

  it("user_class が空文字の場合は null を返す（不正な値としてフォールバック）", () => {
    expect(readClassClaim(fakeToken({ user_class: "" }))).toBeNull();
  });

  it("user_class が文字列以外（数値等）の場合は null を返す", () => {
    expect(readClassClaim(fakeToken({ user_class: 42 }))).toBeNull();
  });

  it("不正な形式のトークンでは null を返す（例外を投げない）", () => {
    expect(readClassClaim("not-a-jwt")).toBeNull();
    expect(readClassClaim("only.two")).toBeNull();
    expect(readClassClaim("a.not-base64!!.c")).toBeNull();
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
      "/extra-entries",
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

  it("accounting には経理用一覧・損益計算書・定期費用マスタ・経理追加収支を表示する", () => {
    expect(hrefsFor("accounting")).toEqual([
      "/",
      "/new",
      "/accounting",
      "/profit-loss",
      "/recurring-costs",
      "/extra-entries",
    ]);
  });

  it("ロールが null の場合はロール制限のない項目のみ表示する", () => {
    expect(hrefsFor(null)).toEqual(["/", "/new"]);
  });
});
