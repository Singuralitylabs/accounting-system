import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasClassAccess,
  isRole,
  PROFILE_WRITE_CLASSES,
  ROLE_DISPLAY_RANK,
  ROLES,
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

describe("ロール一覧（ROLES）の整合（Issue #192）", () => {
  it("isRole は ROLES の値だけ true を返す", () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("表示順（ROLE_DISPLAY_RANK）はすべてのロールを重複なく定義している", () => {
    expect(Object.keys(ROLE_DISPLAY_RANK).sort()).toEqual([...ROLES].sort());
    const ranks = Object.values(ROLE_DISPLAY_RANK);
    expect(new Set(ranks).size).toBe(ROLES.length);
  });

  it("ROUTE_PERMISSIONS・PROFILE_WRITE_CLASSES はすべて ROLES の値だけを使う", () => {
    const used = [
      ...Object.values(ROUTE_PERMISSIONS).flat(),
      ...PROFILE_WRITE_CLASSES,
    ];
    for (const role of used) expect(isRole(role)).toBe(true);
  });

  // update_profiles の許可値と ROLES がずれると、選択肢に出ない・保存時に INVALID_INPUT で
  // 弾かれるといった不整合がエラーなしに起きる。後続のマイグレーションが update_profiles を
  // 再定義しても古い定義を見続けないよう、最後に定義したマイグレーションを対象にする
  it("update_profiles（最後に定義したマイグレーション）が受け付ける class の許可値と ROLES が一致する", () => {
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
      /\(e\.elem\s*->>\s*'class'\)\s+NOT\s+IN\s*\(([^)]*)\)/i,
    );
    expect(match).not.toBeNull();
    const allowed = Array.from(match![1].matchAll(/'([^']+)'/g), (m) => m[1]);
    expect(new Set(allowed).size).toBe(allowed.length);
    expect([...allowed].sort()).toEqual([...ROLES].sort());
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
