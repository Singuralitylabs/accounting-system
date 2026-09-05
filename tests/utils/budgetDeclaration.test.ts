import { describe, expect, it } from "vitest";
import {
  BUDGET_ALL_TEAMS_CLASSES,
  BUDGET_DECLARATION_ALLOWED_CLASSES,
  BudgetDeclarationError,
  BudgetDeclarationWithItems,
  addMonths,
  buildBudgetDeclarationStatusList,
  canWriteBudgetTeam,
  defaultTargetMonth,
  isForbiddenError,
  isPartialWriteFailureError,
  previousItemsToFormRows,
  summarizeBudgetItems,
  totalBudgetSummary,
  visibleBudgetTeams,
} from "@/app/utils/budgetDeclaration";
import { ROUTE_PERMISSIONS } from "@/app/utils/permissions";

const declaration = (
  overrides: Partial<BudgetDeclarationWithItems> & { team: string },
): BudgetDeclarationWithItems => ({
  id: 1,
  updated_at: "2026-08-20T10:00:00+09:00",
  declared_by_name: "山田",
  items: [],
  ...overrides,
});

describe("addMonths", () => {
  it("同一年内で加算する", () => {
    expect(addMonths("2026-03", 2)).toBe("2026-05");
  });

  it("年をまたいで繰り上がる", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });

  it("年をまたいで繰り下がる", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("12ヶ月以上の加算・減算でも年が正しく動く", () => {
    expect(addMonths("2026-06", 18)).toBe("2027-12");
    expect(addMonths("2026-06", -18)).toBe("2024-12");
  });

  it("0 の加算は同じ月を返す", () => {
    expect(addMonths("2026-06", 0)).toBe("2026-06");
  });
});

describe("defaultTargetMonth", () => {
  it("JST 基準の翌月を返す", () => {
    expect(defaultTargetMonth(new Date("2026-08-30T00:00:00Z"))).toBe(
      "2026-09",
    );
  });

  it("年末は翌年1月になる", () => {
    expect(defaultTargetMonth(new Date("2026-12-15T00:00:00Z"))).toBe(
      "2027-01",
    );
  });

  it("UTC では前年でも JST で年が変わっていれば翌月が繰り上がる", () => {
    // 2026-12-31T15:00:00Z = 2027-01-01 JST → 翌月は 2027-02
    expect(defaultTargetMonth(new Date("2026-12-31T15:00:00Z"))).toBe(
      "2027-02",
    );
  });
});

describe("summarizeBudgetItems", () => {
  it("種別ごとに合計し差引を求める", () => {
    expect(
      summarizeBudgetItems([
        { entry_type: "income", amount: 300000 },
        { entry_type: "income", amount: 200000 },
        { entry_type: "expense", amount: 120000 },
      ]),
    ).toEqual({ incomeTotal: 500000, expenseTotal: 120000, balance: 380000 });
  });

  it("明細が空なら全て 0", () => {
    expect(summarizeBudgetItems([])).toEqual({
      incomeTotal: 0,
      expenseTotal: 0,
      balance: 0,
    });
  });

  it("支出が収入を上回ると差引はマイナスになる", () => {
    expect(
      summarizeBudgetItems([
        { entry_type: "income", amount: 10000 },
        { entry_type: "expense", amount: 30000 },
      ]).balance,
    ).toBe(-20000);
  });

  it("想定外の種別は収入にも支出にも算入しない", () => {
    expect(
      summarizeBudgetItems([
        { entry_type: "income", amount: 1000 },
        { entry_type: "unknown", amount: 9999 },
      ]),
    ).toEqual({ incomeTotal: 1000, expenseTotal: 0, balance: 1000 });
  });
});

describe("visibleBudgetTeams", () => {
  const teamList = ["Aチーム", "Bチーム", "Cチーム"];

  it("経理・管理者は全チームを表示する", () => {
    expect(visibleBudgetTeams("accounting", null, teamList)).toEqual(teamList);
    expect(visibleBudgetTeams("admin", "Aチーム", teamList)).toEqual(teamList);
  });

  it("チームリーダーは自チームのみ表示する", () => {
    expect(visibleBudgetTeams("teamleader", "Bチーム", teamList)).toEqual([
      "Bチーム",
    ]);
  });

  it("チーム未設定のチームリーダーは表示対象なし", () => {
    expect(visibleBudgetTeams("teamleader", null, teamList)).toEqual([]);
    expect(visibleBudgetTeams("teamleader", "", teamList)).toEqual([]);
  });

  it("public・ロール未設定は表示対象なし", () => {
    expect(visibleBudgetTeams("public", "Aチーム", teamList)).toEqual([]);
    expect(visibleBudgetTeams(null, "Aチーム", teamList)).toEqual([]);
  });

  it("マスタに無いチームを持つチームリーダーでも自チームを表示する", () => {
    // チームマスタから無効化された後も、自チームの申告状況は確認できる必要がある
    expect(visibleBudgetTeams("teamleader", "旧チーム", teamList)).toEqual([
      "旧チーム",
    ]);
  });

  it("返り値は引数のチーム配列と独立している（呼び出し元の変更が波及しない）", () => {
    const result = visibleBudgetTeams("admin", null, teamList);
    result.push("Dチーム");
    expect(teamList).toEqual(["Aチーム", "Bチーム", "Cチーム"]);
  });
});

describe("canWriteBudgetTeam", () => {
  it("経理・管理者は全チームへ書き込める", () => {
    expect(canWriteBudgetTeam("accounting", null, "Aチーム")).toBe(true);
    expect(canWriteBudgetTeam("admin", "Bチーム", "Aチーム")).toBe(true);
  });

  it("チームリーダーは自チームのみ書き込める", () => {
    expect(canWriteBudgetTeam("teamleader", "Aチーム", "Aチーム")).toBe(true);
    expect(canWriteBudgetTeam("teamleader", "Aチーム", "Bチーム")).toBe(false);
  });

  it("チーム未設定のチームリーダーはどのチームにも書き込めない", () => {
    expect(canWriteBudgetTeam("teamleader", null, "Aチーム")).toBe(false);
  });

  it("public・ロール未設定は書き込めない", () => {
    expect(canWriteBudgetTeam("public", "Aチーム", "Aチーム")).toBe(false);
    expect(canWriteBudgetTeam(null, "Aチーム", "Aチーム")).toBe(false);
  });
});

describe("buildBudgetDeclarationStatusList", () => {
  it("申告があるチームは集計付きの申告済み行になる", () => {
    const rows = buildBudgetDeclarationStatusList(
      ["Aチーム"],
      [
        declaration({
          id: 7,
          team: "Aチーム",
          items: [
            { entry_type: "income", amount: 500000 },
            { entry_type: "expense", amount: 200000 },
          ],
        }),
      ],
    );

    expect(rows).toEqual([
      {
        team: "Aチーム",
        declarationId: 7,
        isDeclared: true,
        declaredByName: "山田",
        updatedAt: "2026-08-20T10:00:00+09:00",
        summary: {
          incomeTotal: 500000,
          expenseTotal: 200000,
          balance: 300000,
        },
      },
    ]);
  });

  it("申告が無いチームは未申告行（集計 0）になる", () => {
    const rows = buildBudgetDeclarationStatusList(
      ["Aチーム", "Bチーム"],
      [declaration({ team: "Aチーム" })],
    );

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      team: "Bチーム",
      declarationId: null,
      isDeclared: false,
      declaredByName: null,
      summary: { incomeTotal: 0, expenseTotal: 0, balance: 0 },
    });
  });

  it("チーム一覧の並び順を保つ", () => {
    const rows = buildBudgetDeclarationStatusList(
      ["Cチーム", "Aチーム", "Bチーム"],
      [declaration({ team: "Aチーム" })],
    );

    expect(rows.map((row) => row.team)).toEqual([
      "Cチーム",
      "Aチーム",
      "Bチーム",
    ]);
  });

  it("チームマスタに無いチームの申告も末尾に残す（取りこぼし防止）", () => {
    const rows = buildBudgetDeclarationStatusList(
      ["Aチーム"],
      [
        declaration({ team: "Aチーム" }),
        declaration({
          id: 2,
          team: "旧チーム",
          items: [{ entry_type: "income", amount: 1000 }],
        }),
      ],
    );

    expect(rows.map((row) => row.team)).toEqual(["Aチーム", "旧チーム"]);
    expect(rows[1].isDeclared).toBe(true);
    expect(rows[1].summary.incomeTotal).toBe(1000);
  });

  it("申告が 1 件も無くてもチーム分の未申告行を返す", () => {
    const rows = buildBudgetDeclarationStatusList(["Aチーム", "Bチーム"], []);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => !row.isDeclared)).toBe(true);
  });

  it("申告者名が読めない（profiles の RLS 対象外）場合は null になる", () => {
    const rows = buildBudgetDeclarationStatusList(
      ["Aチーム"],
      [declaration({ team: "Aチーム", declared_by_name: null })],
    );

    expect(rows[0].declaredByName).toBeNull();
    // 名前が読めなくても申告済みの判定・集計は行う
    expect(rows[0].isDeclared).toBe(true);
  });
});

describe("totalBudgetSummary", () => {
  it("表示中の行の合計を求める", () => {
    const rows = buildBudgetDeclarationStatusList(
      ["Aチーム", "Bチーム", "Cチーム"],
      [
        declaration({
          team: "Aチーム",
          items: [
            { entry_type: "income", amount: 500000 },
            { entry_type: "expense", amount: 200000 },
          ],
        }),
        declaration({
          id: 2,
          team: "Bチーム",
          items: [{ entry_type: "expense", amount: 50000 }],
        }),
      ],
    );

    expect(totalBudgetSummary(rows)).toEqual({
      incomeTotal: 500000,
      expenseTotal: 250000,
      balance: 250000,
    });
  });

  it("行が無ければ 0", () => {
    expect(totalBudgetSummary([])).toEqual({
      incomeTotal: 0,
      expenseTotal: 0,
      balance: 0,
    });
  });
});

describe("閲覧ロールの定義", () => {
  it("/budget-declarations のルート保護と同じロール定義を参照する", () => {
    expect(BUDGET_DECLARATION_ALLOWED_CLASSES).toBe(
      ROUTE_PERMISSIONS["/budget-declarations"],
    );
  });

  it("全チーム閲覧ロールは、閲覧可ロールから自チーム限定ロールを除いたもの", () => {
    // ROUTE_PERMISSIONS にロールを足したときに一覧の表示範囲が追随することの回帰
    expect(BUDGET_ALL_TEAMS_CLASSES).toEqual(
      BUDGET_DECLARATION_ALLOWED_CLASSES.filter(
        (role) => role !== "teamleader",
      ),
    );
    expect(BUDGET_ALL_TEAMS_CLASSES).toEqual(["accounting", "admin"]);
  });
});

describe("BudgetDeclarationError / isForbiddenError", () => {
  it("権限不足はリトライ対象外として判定できる", () => {
    const error = new BudgetDeclarationError({
      kind: "forbidden",
      message: "事前収支申告の閲覧権限がありません。",
    });

    expect(isForbiddenError(error)).toBe(true);
    expect(error.message).toBe("事前収支申告の閲覧権限がありません。");
  });

  it("一時的な取得失敗はリトライ対象になる", () => {
    expect(
      isForbiddenError(
        new BudgetDeclarationError({
          kind: "fetchFailed",
          message: "事前収支申告の取得に失敗しました。",
        }),
      ),
    ).toBe(false);
  });

  it("無関係なエラーは権限不足と判定しない", () => {
    expect(isForbiddenError(new Error("network"))).toBe(false);
    expect(isForbiddenError(null)).toBe(false);
    // Error でないただのオブジェクトも対象外
    expect(isForbiddenError({ kind: "forbidden" })).toBe(false);
  });
});

describe("isPartialWriteFailureError", () => {
  it("明細差し替えの途中で失敗した場合（partialWriteFailed）は一部反映の可能性があると判定する", () => {
    expect(
      isPartialWriteFailureError(
        new BudgetDeclarationError({
          kind: "partialWriteFailed",
          message: "事前収支申告の明細登録に失敗しました。",
        }),
      ),
    ).toBe(true);
  });

  it("何も書き込まれていない失敗（fetchFailed・forbidden・validationFailed・duplicate）は対象外", () => {
    // fetchFailed はヘッダ保存自体の失敗・対象行なしにも使われ、
    // その場合は何も書き込まれていないため対象外にする
    expect(
      isPartialWriteFailureError(
        new BudgetDeclarationError({ kind: "fetchFailed", message: "" }),
      ),
    ).toBe(false);
    expect(
      isPartialWriteFailureError(
        new BudgetDeclarationError({ kind: "forbidden", message: "" }),
      ),
    ).toBe(false);
    expect(
      isPartialWriteFailureError(
        new BudgetDeclarationError({ kind: "validationFailed", message: "" }),
      ),
    ).toBe(false);
    expect(
      isPartialWriteFailureError(
        new BudgetDeclarationError({ kind: "duplicate", message: "" }),
      ),
    ).toBe(false);
  });

  it("無関係なエラーは対象外", () => {
    expect(isPartialWriteFailureError(new Error("network"))).toBe(false);
    expect(isPartialWriteFailureError(null)).toBe(false);
  });
});

describe("previousItemsToFormRows", () => {
  // 並び順は取得側（getPreviousBudgetDeclarationItems）が display_order 順に
  // 揃えて渡す前提のため、ここでは渡された順のまま変換されることだけ確認する
  it("id・display_order を持たない新規行に変換する（担当者も引き継ぐ）", () => {
    expect(
      previousItemsToFormRows([
        {
          id: 10,
          entry_type: "income",
          category: "セミナー",
          description: "○○受託案件",
          amount: 500000,
          manager_id: 1,
          display_order: 0,
        },
        {
          id: 11,
          entry_type: "expense",
          category: "外注費",
          description: "外注A",
          amount: 100000,
          manager_id: 2,
          display_order: 1,
        },
      ]),
    ).toEqual([
      {
        entry_type: "income",
        category: "セミナー",
        description: "○○受託案件",
        amount: 500000,
        manager_id: 1,
      },
      {
        entry_type: "expense",
        category: "外注費",
        description: "外注A",
        amount: 100000,
        manager_id: 2,
      },
    ]);
  });

  it("担当者未設定（manager_id: null）の明細もそのまま変換する", () => {
    expect(
      previousItemsToFormRows([
        {
          id: 10,
          entry_type: "income",
          category: "セミナー",
          description: "○○受託案件",
          amount: 500000,
          manager_id: null,
          display_order: 0,
        },
      ]),
    ).toEqual([
      {
        entry_type: "income",
        category: "セミナー",
        description: "○○受託案件",
        amount: 500000,
        manager_id: null,
      },
    ]);
  });

  it("明細 0 件なら空配列を返す", () => {
    expect(previousItemsToFormRows([])).toEqual([]);
  });
});
