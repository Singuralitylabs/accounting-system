import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasClassAccess,
  isRole,
  PROFILE_WRITE_CLASSES,
  TEAM_MATTER_VIEW_CLASSES,
  CLASS_DISPLAY_RANK,
  CLASS_SELECT_OPTIONS,
  PROFILE_CLASSES,
  ROLE_LABELS,
  ROLES,
  effectiveRoles,
  isProfileClass,
  visibleNavItems,
  ROUTE_PERMISSIONS,
  AUTH_ONLY_ROUTES,
  isAuthOnlyPath,
} from "@/app/utils/permissions";

describe("hasClassAccess", () => {
  it("許可ロールに含まれる場合は true を返す", () => {
    expect(hasClassAccess(["teamleader", "admin"], "admin")).toBe(true);
    expect(hasClassAccess(["teamleader", "admin"], "public", true)).toBe(true);
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

  it("teamleader は class ではなくフラグでのみ満たされる", () => {
    expect(hasClassAccess(["teamleader", "admin"], "teamleader")).toBe(false);
    expect(hasClassAccess(["teamleader", "admin"], "public", true)).toBe(true);
    expect(hasClassAccess(["teamleader", "admin"], "public", false)).toBe(
      false,
    );
    expect(hasClassAccess(["teamleader"], null, true)).toBe(true);
  });

  it("フラグ付きの経理は accounting と teamleader の両方の許可で通る", () => {
    expect(hasClassAccess(["accounting"], "accounting", true)).toBe(true);
    expect(hasClassAccess(["teamleader"], "accounting", true)).toBe(true);
    expect(hasClassAccess(["teamleader"], "accounting", false)).toBe(false);
  });
});

describe("effectiveRoles", () => {
  it("フラグなしの class はその class だけを返す", () => {
    expect(effectiveRoles("public")).toEqual(["public"]);
    expect(effectiveRoles("public", false)).toEqual(["public"]);
    expect(effectiveRoles("admin", null)).toEqual(["admin"]);
  });

  it("フラグ付きの public は public と teamleader を返す", () => {
    expect(effectiveRoles("public", true)).toEqual(["public", "teamleader"]);
  });

  it("フラグ付きの accounting は accounting と teamleader を返す", () => {
    expect(effectiveRoles("accounting", true)).toEqual([
      "accounting",
      "teamleader",
    ]);
  });

  it("class が null / undefined でもフラグがあれば teamleader だけを返す", () => {
    expect(effectiveRoles(null, true)).toEqual(["teamleader"]);
    expect(effectiveRoles(undefined, true)).toEqual(["teamleader"]);
    expect(effectiveRoles(null)).toEqual([]);
    expect(effectiveRoles(undefined, false)).toEqual([]);
  });

  it("未知の class は実効ロールにならない（フラグがあれば teamleader のみ）", () => {
    expect(effectiveRoles("superuser")).toEqual([]);
    expect(effectiveRoles("superuser", true)).toEqual(["teamleader"]);
  });

  it("class としての 'teamleader' は実効ロールにならない", () => {
    expect(effectiveRoles("teamleader")).toEqual([]);
    expect(effectiveRoles("teamleader", false)).toEqual([]);
    expect(effectiveRoles("teamleader", true)).toEqual(["teamleader"]);
  });
});

describe("ROUTE_PERMISSIONS による各保護ルートの認可", () => {
  it.each([
    ["/matters/team", "public", true, true],
    ["/matters/team", "public", false, false],
    ["/matters/team", "accounting", false, false],
    ["/matters/team", "accounting", true, true],
    ["/matters/accounting", "accounting", false, true],
    ["/matters/accounting", "accounting", true, true],
    ["/matters/accounting", "public", true, false],
    // Legacy URLs keep the same roles as the new ones (kept for protection before the redirect).
    ["/team", "public", true, true],
    ["/team", "accounting", false, false],
    ["/accounting", "accounting", false, true],
    ["/accounting", "public", true, false],
    ["/profit-loss", "public", true, true],
    ["/profit-loss", "accounting", false, true],
    ["/profit-loss", "public", false, false],
    ["/recurring-costs", "accounting", false, true],
    ["/recurring-costs", "public", true, false],
    ["/extra-entries", "accounting", false, true],
    ["/extra-entries", "public", true, false],
    ["/budget-declarations", "public", true, true],
    ["/budget-declarations", "accounting", false, true],
    ["/budget-declarations", "public", false, false],
    ["/dashboard", "admin", false, true],
    ["/dashboard", "accounting", true, false],
  ])(
    "%s へのアクセス: class %s・teamleader フラグ %s → %s",
    (route, profileClass, isTeamleader, expected) => {
      expect(
        hasClassAccess(ROUTE_PERMISSIONS[route], profileClass, isTeamleader),
      ).toBe(expected);
    },
  );

  it("フラグ付きの経理は /matters/team と /matters/accounting の両方にアクセスできる", () => {
    expect(
      hasClassAccess(ROUTE_PERMISSIONS["/matters/team"], "accounting", true),
    ).toBe(true);
    expect(
      hasClassAccess(
        ROUTE_PERMISSIONS["/matters/accounting"],
        "accounting",
        true,
      ),
    ).toBe(true);
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
  it("ログイン必須ルートは /, /matters である", () => {
    expect(AUTH_ONLY_ROUTES).toEqual(["/", "/matters"]);
  });

  it.each([
    ["/", true],
    ["/matters", true],
    ["/matters/1", true],
    ["/login", false],
    ["/dashboard", false],
    ["/team", false],
    ["/matter", false],
    ["/mattersome", false],
    ["/new", false],
  ])("%s はログイン必須判定が %s", (pathname, expected) => {
    expect(isAuthOnlyPath(pathname)).toBe(expected);
  });
});

describe("visibleNavItems", () => {
  const hrefsFor = (
    profileClass: string | null | undefined,
    isTeamleader?: boolean,
  ) => visibleNavItems(profileClass, isTeamleader).map((item) => item.href);

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

  it("フラグ付きの public には案件カード・損益計算書・事前収支申告を表示する", () => {
    expect(hrefsFor("public", true)).toEqual([
      "/matters",
      "/profit-loss",
      "/budget-declarations",
    ]);
  });

  it("フラグ付きの accounting（兼任）にも同じ項目を重複なく表示する", () => {
    expect(hrefsFor("accounting", true)).toEqual([
      "/matters",
      "/profit-loss",
      "/budget-declarations",
    ]);
  });

  it("フラグ付きの admin には全項目を表示する", () => {
    expect(hrefsFor("admin", true)).toEqual([
      "/matters",
      "/profit-loss",
      "/budget-declarations",
      "/dashboard",
    ]);
  });

  it("class が 'teamleader' の値は実効ロールにならず案件カードのみ表示する", () => {
    expect(hrefsFor("teamleader")).toEqual(["/matters"]);
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
    expect(hrefsFor(null, false)).toEqual(["/matters"]);
  });

  it("すべてのナビ項目にハブ用の説明文がある", () => {
    const items = visibleNavItems("admin");
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.description.length).toBeGreaterThan(0);
    }
  });
});

describe("ロール一覧（ROLES）の整合（Issue #192）", () => {
  it("isRole は ROLES の値だけ true を返す", () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("isProfileClass は PROFILE_CLASSES の値だけ true を返す", () => {
    expect([...PROFILE_CLASSES]).toEqual(["public", "accounting", "admin"]);
    for (const c of PROFILE_CLASSES) expect(isProfileClass(c)).toBe(true);
    expect(isProfileClass("teamleader")).toBe(false);
    expect(isProfileClass("")).toBe(false);
    expect(isProfileClass(null)).toBe(false);
    expect(isProfileClass(undefined)).toBe(false);
  });

  it("表示順（CLASS_DISPLAY_RANK）はすべての class を重複なく定義している", () => {
    expect(Object.keys(CLASS_DISPLAY_RANK).sort()).toEqual(
      [...PROFILE_CLASSES].sort(),
    );
    const ranks = Object.values(CLASS_DISPLAY_RANK);
    expect(new Set(ranks).size).toBe(PROFILE_CLASSES.length);
  });

  it("表示名（ROLE_LABELS）はすべてのロールを定義し、表示名が重複しない", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort());
    const labels = Object.values(ROLE_LABELS);
    expect(new Set(labels).size).toBe(ROLES.length);
    expect(ROLE_LABELS).toEqual({
      admin: "管理者",
      accounting: "経理",
      teamleader: "チームリーダー",
      public: "メンバー",
    });
  });

  it("権限セレクトの選択肢は PROFILE_CLASSES の順で、value は DB の値・label は表示名", () => {
    expect(CLASS_SELECT_OPTIONS).toEqual(
      PROFILE_CLASSES.map((c) => ({ value: c, label: ROLE_LABELS[c] })),
    );
    expect(CLASS_SELECT_OPTIONS.map((o) => o.value)).not.toContain(
      "teamleader",
    );
  });

  it("ROUTE_PERMISSIONS・PROFILE_WRITE_CLASSES はすべて ROLES の値だけを使う", () => {
    const used = [
      ...Object.values(ROUTE_PERMISSIONS).flat(),
      ...PROFILE_WRITE_CLASSES,
    ];
    for (const role of used) expect(isRole(role)).toBe(true);
  });

  // If the values update_profiles allows drift from PROFILE_CLASSES, options vanish or saves fail with INVALID_INPUT
  // silently. Target the last migration that defines update_profiles so later redefinitions are not missed.
  it("update_profiles（最後に定義したマイグレーション）が受け付ける class の許可値と PROFILE_CLASSES が一致する", () => {
    const dir = resolve(__dirname, "../../supabase/migrations");
    const definitions = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(resolve(dir, name), "utf-8"))
      .filter((sql) =>
        /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.update_profiles\s*\(/i.test(
          sql,
        ),
      );
    expect(definitions.length).toBeGreaterThan(0);
    const sql = definitions[definitions.length - 1];
    const match = sql.match(
      /\(\s*e\.elem\s*->>\s*'class'\s*\)\s*NOT\s+IN\s*\(([^)]*)\)/i,
    );
    expect(
      match,
      "update_profiles の class の許可値を抽出できません（SQL の書式を変えた場合は、このテストの正規表現も更新してください）",
    ).not.toBeNull();
    const allowed = Array.from(match![1].matchAll(/'([^']+)'/g), (m) => m[1]);
    expect(new Set(allowed).size).toBe(allowed.length);
    expect([...allowed].sort()).toEqual([...PROFILE_CLASSES].sort());
  });
});

describe("PROFILE_WRITE_CLASSES（ユーザーリストの一括保存の権限。Issue #191）", () => {
  it("権限の変更（特権の昇格）は admin のみ。profiles の RLS・update_profiles と揃える", () => {
    expect(PROFILE_WRITE_CLASSES).toEqual(["admin"]);
  });

  it("書き込めるロールは、管理画面（/dashboard）を開けるロールに必ず含まれる", () => {
    for (const role of PROFILE_WRITE_CLASSES) {
      expect(hasClassAccess(ROUTE_PERMISSIONS["/dashboard"], role)).toBe(true);
    }
  });
});

describe("TEAM_MATTER_VIEW_CLASSES（チーム案件の取得の権限。Issue #215）", () => {
  it("チーム案件のルート保護（/matters/team）と同じ定義を参照する", () => {
    expect(TEAM_MATTER_VIEW_CLASSES).toBe(ROUTE_PERMISSIONS["/matters/team"]);
    expect(TEAM_MATTER_VIEW_CLASSES).toEqual(["teamleader", "admin"]);
  });
});
