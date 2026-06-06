import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDateToJp,
  formatMonthHeader,
  formatMonthLabel,
  formatTimeToJp,
  toMonthString,
} from "@/app/utils/formatter";

// vitest.config.ts で TZ=Asia/Tokyo に固定している（JST 前提のアプリのため）

describe("toMonthString", () => {
  it("月キー（YYYY-MM）へ変換し、1桁の月はゼロ埋めする", () => {
    expect(toMonthString(new Date(2025, 0, 15))).toBe("2025-01");
    expect(toMonthString(new Date(2025, 11, 31))).toBe("2025-12");
  });

  it("JST の月初日が UTC 変換で前月にずれない（toISOString のズレ回帰）", () => {
    // 2025-05-01 00:00 JST は UTC では 2025-04-30 15:00。
    // toISOString ベースの実装だと "2025-04" になってしまう。
    expect(toMonthString(new Date("2025-05-01T00:00:00+09:00"))).toBe(
      "2025-05",
    );
  });

  it("年をまたぐ月境界を正しく変換する", () => {
    expect(toMonthString(new Date("2026-01-01T00:00:00+09:00"))).toBe(
      "2026-01",
    );
    expect(toMonthString(new Date("2025-12-31T23:59:59+09:00"))).toBe(
      "2025-12",
    );
  });
});

describe("formatCurrency", () => {
  it("金額を円表記にする", () => {
    expect(formatCurrency(1000)).toBe("￥1,000");
    expect(formatCurrency(1234567)).toBe("￥1,234,567");
  });

  it("0 円を表記できる", () => {
    expect(formatCurrency(0)).toBe("￥0");
  });

  it("負の金額を表記できる", () => {
    expect(formatCurrency(-500)).toBe("-￥500");
  });

  it("null の場合は - を返す", () => {
    expect(formatCurrency(null)).toBe("-");
  });
});

describe("formatMonthLabel", () => {
  it("月キーを「YYYY年M月」表記にする（先頭ゼロを除去）", () => {
    expect(formatMonthLabel("2025-01")).toBe("2025年1月");
    expect(formatMonthLabel("2025-12")).toBe("2025年12月");
  });
});

describe("formatMonthHeader", () => {
  it("月キーを「M月」表記にする（先頭ゼロを除去）", () => {
    expect(formatMonthHeader("2025-04")).toBe("4月");
    expect(formatMonthHeader("2025-10")).toBe("10月");
  });
});

describe("formatDateToJp", () => {
  it("日付文字列を YYYY/MM/DD 表記にする", () => {
    expect(formatDateToJp("2025-01-05")).toBe("2025/01/05");
    expect(formatDateToJp("2025-12-31")).toBe("2025/12/31");
  });

  it("null / 空文字の場合は - を返す", () => {
    expect(formatDateToJp(null)).toBe("-");
    expect(formatDateToJp("")).toBe("-");
  });
});

describe("formatTimeToJp", () => {
  it("日時文字列を日本語ロケールの日時表記にする（JST）", () => {
    // 2025-01-05T00:00:00Z は JST では 2025/1/5 9:00:00
    expect(formatTimeToJp("2025-01-05T00:00:00Z")).toBe("2025/1/5 9:00:00");
  });

  it("null の場合は - を返す", () => {
    expect(formatTimeToJp(null)).toBe("-");
  });
});
