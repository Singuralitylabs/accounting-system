import { describe, expect, it } from "vitest";
import {
  buildCopiedExtraEntries,
  excludeDuplicateExtraEntries,
  extraEntryDuplicateKey,
  formatEntryType,
  shiftDateToMonth,
} from "@/app/utils/extraEntry";
import { ExtraEntryType } from "@/app/types/types";

const entry = (overrides: Partial<ExtraEntryType> = {}): ExtraEntryType => ({
  id: 1,
  entry_type: "income",
  category: "受託収入",
  entry_date: "2026-08-10",
  invoice_number: "INV-001",
  description: "受託案件A",
  billing_target: "株式会社A",
  manager_id: 5,
  team: "Aチーム",
  billing_amount: 300000,
  expense_amount: null,
  payment_method: null,
  inserted_at: "2026-08-01T00:00:00+09:00",
  updated_at: "2026-08-01T00:00:00+09:00",
  ...overrides,
});

describe("formatEntryType", () => {
  it("収入・支出を日本語表記に変換する", () => {
    expect(formatEntryType("income")).toBe("収入");
    expect(formatEntryType("expense")).toBe("支出");
  });

  it("想定外の値はそのまま返す", () => {
    expect(formatEntryType("unknown")).toBe("unknown");
  });
});

describe("shiftDateToMonth", () => {
  it("対象月に同じ日がある場合はそのまま置き換える", () => {
    expect(shiftDateToMonth("2026-08-10", "2026-09")).toBe("2026-09-10");
  });

  it("31日は対象月の末日（30日）に丸める", () => {
    expect(shiftDateToMonth("2026-08-31", "2026-09")).toBe("2026-09-30");
  });

  it("うるう年でない2月への29日は28日に丸める", () => {
    expect(shiftDateToMonth("2026-01-29", "2026-02")).toBe("2026-02-28");
  });

  it("うるう年の2月は29日まで保つ", () => {
    expect(shiftDateToMonth("2028-01-30", "2028-02")).toBe("2028-02-29");
  });

  it("年をまたぐ月への置き換えもできる", () => {
    expect(shiftDateToMonth("2026-12-15", "2027-01")).toBe("2027-01-15");
  });
});

describe("buildCopiedExtraEntries", () => {
  it("id・inserted_at・updated_at を除き、日付を当月へ置き換え、請求書番号を空にする", () => {
    const rows = buildCopiedExtraEntries([entry()], "2026-09");

    expect(rows).toEqual([
      {
        entry_type: "income",
        category: "受託収入",
        entry_date: "2026-09-10",
        invoice_number: null,
        description: "受託案件A",
        billing_target: "株式会社A",
        manager_id: 5,
        team: "Aチーム",
        billing_amount: 300000,
        expense_amount: null,
        payment_method: null,
      },
    ]);
  });

  it("月末超過は対象月の末日に丸めて複製する", () => {
    const rows = buildCopiedExtraEntries(
      [entry({ entry_date: "2026-08-31" })],
      "2026-09",
    );

    expect(rows[0].entry_date).toBe("2026-09-30");
  });

  it("支出エントリも同様に複製する（決済方法を引き継ぐ）", () => {
    const rows = buildCopiedExtraEntries(
      [
        entry({
          entry_type: "expense",
          category: "外注費",
          billing_target: null,
          billing_amount: null,
          expense_amount: 80000,
          payment_method: "銀行振込",
          invoice_number: null,
        }),
      ],
      "2026-09",
    );

    expect(rows[0]).toMatchObject({
      entry_type: "expense",
      expense_amount: 80000,
      payment_method: "銀行振込",
      invoice_number: null,
    });
  });

  it("entry_date が NULL（月未確定）の明細は対象外にする", () => {
    const rows = buildCopiedExtraEntries(
      [entry({ entry_date: null }), entry({ id: 2, entry_date: "2026-08-05" })],
      "2026-09",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].entry_date).toBe("2026-09-05");
  });

  it("明細が空なら空配列を返す", () => {
    expect(buildCopiedExtraEntries([], "2026-09")).toEqual([]);
  });

  it("全体共通（team: null）の明細もチーム未設定のまま複製する", () => {
    const rows = buildCopiedExtraEntries([entry({ team: null })], "2026-09");
    expect(rows[0].team).toBeNull();
  });
});

describe("extraEntryDuplicateKey", () => {
  it("entry_type・分類・内容・責任者・チーム・金額が同じなら同じキーになる", () => {
    const a = entry({ id: 1, entry_date: "2026-08-10" });
    const b = entry({ id: 2, entry_date: "2026-09-10", invoice_number: null });
    expect(extraEntryDuplicateKey(a)).toBe(extraEntryDuplicateKey(b));
  });

  it("金額が違えば別キーになる", () => {
    const a = entry({ billing_amount: 300000 });
    const b = entry({ billing_amount: 300001 });
    expect(extraEntryDuplicateKey(a)).not.toBe(extraEntryDuplicateKey(b));
  });

  it("チームが違えば別キーになる（全体共通 team: null との区別も含む）", () => {
    const a = entry({ team: "Aチーム" });
    const b = entry({ team: "Bチーム" });
    const c = entry({ team: null });
    expect(extraEntryDuplicateKey(a)).not.toBe(extraEntryDuplicateKey(b));
    expect(extraEntryDuplicateKey(a)).not.toBe(extraEntryDuplicateKey(c));
  });

  it("ExtraEntryInsertType 形（team 等が省略された行）でも Row と同じキーになる", () => {
    const row = buildCopiedExtraEntries([entry()], "2026-09")[0];
    expect(extraEntryDuplicateKey(row)).toBe(
      extraEntryDuplicateKey(entry({ entry_date: "2026-09-10" })),
    );
  });
});

describe("excludeDuplicateExtraEntries", () => {
  it("当月に同一内容の明細が既にあれば除外する", () => {
    const rows = buildCopiedExtraEntries([entry()], "2026-09");
    const existing = [entry({ id: 99, entry_date: "2026-09-10" })];

    expect(excludeDuplicateExtraEntries(rows, existing)).toEqual([]);
  });

  it("重複が無ければそのまま返す", () => {
    const rows = buildCopiedExtraEntries([entry()], "2026-09");
    const existing = [entry({ id: 99, billing_amount: 999999 })];

    expect(excludeDuplicateExtraEntries(rows, existing)).toEqual(rows);
  });

  it("一部だけ重複する場合は重複分だけ除外する", () => {
    const rows = buildCopiedExtraEntries(
      [
        entry({ id: 1, description: "受託案件A" }),
        entry({ id: 2, description: "受託案件B" }),
      ],
      "2026-09",
    );
    const existing = [
      entry({ id: 99, entry_date: "2026-09-10", description: "受託案件A" }),
    ];

    const result = excludeDuplicateExtraEntries(rows, existing);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("受託案件B");
  });

  it("当月に既存明細が無ければ全件そのまま返す", () => {
    const rows = buildCopiedExtraEntries([entry()], "2026-09");
    expect(excludeDuplicateExtraEntries(rows, [])).toEqual(rows);
  });
});
