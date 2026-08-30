import { describe, expect, it } from "vitest";
import {
  currentJstMonth,
  formatCurrency,
  formatDateToJp,
  formatMonthHeader,
  formatMonthLabel,
  formatTimeToJp,
  parseDateString,
  toDateString,
  toFirstOfMonth,
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

  it("実行環境の TZ に依存せず JST で表示する（SSR ハイドレーション不一致の回帰）", () => {
    // Intl の timeZone 指定が無いと、UTC のサーバでは "2025/1/5 0:00:00" になり、
    // JST のブラウザと 9 時間ズレてハイドレーションエラーになる。
    // TZ 環境変数はプロセス起動時に固定されるため、ここでは Intl 側の
    // タイムゾーンを直接比較して指定漏れを検知する。
    const utcRendering = new Date("2025-01-05T00:00:00Z").toLocaleDateString(
      "ja-JP",
      {
        timeZone: "UTC",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      },
    );
    expect(formatTimeToJp("2025-01-05T00:00:00Z")).not.toBe(utcRendering);
  });

  it("null の場合は - を返す", () => {
    expect(formatTimeToJp(null)).toBe("-");
  });
});

describe("toFirstOfMonth", () => {
  it("月キー（YYYY-MM）を月初日にする", () => {
    expect(toFirstOfMonth("2026-10")).toBe("2026-10-01");
  });

  it("日付文字列（YYYY-MM-DD）も月初日に丸める", () => {
    expect(toFirstOfMonth("2026-10-25")).toBe("2026-10-01");
  });
});

describe("currentJstMonth", () => {
  it("UTC の月末深夜は JST では翌月になる", () => {
    // 2026-09-30T15:00:00Z = 2026-10-01T00:00 JST
    expect(currentJstMonth(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10");
  });

  it("UTC の月初は JST でも同じ月", () => {
    expect(currentJstMonth(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10");
  });

  it("年末の JST 年跨ぎを正しく扱う", () => {
    expect(currentJstMonth(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01");
  });
});

describe("parseDateString / toDateString", () => {
  it("往復変換で値が保存される（YYYY-MM-DD → Date → YYYY-MM-DD）", () => {
    for (const value of ["2025-01-01", "2025-07-15", "2026-12-31"]) {
      expect(toDateString(parseDateString(value))).toBe(value);
    }
  });

  it("toDateString はローカル要素で組み立て、1桁の月日をゼロ埋めする", () => {
    expect(toDateString(new Date(2025, 0, 5))).toBe("2025-01-05");
    expect(toDateString(new Date(2025, 11, 31))).toBe("2025-12-31");
  });

  it("JST 深夜でも toISOString の UTC ズレで前日にならない（回帰）", () => {
    // 2025-05-01 00:00 JST は UTC では 2025-04-30 15:00。
    // toISOString ベースだと "2025-04-30" にずれてしまう。
    expect(toDateString(new Date("2025-05-01T00:00:00+09:00"))).toBe(
      "2025-05-01",
    );
  });

  it("月末・年またぎの境界を正しく扱う", () => {
    expect(toDateString(new Date("2025-12-31T23:59:59+09:00"))).toBe(
      "2025-12-31",
    );
    expect(toDateString(new Date("2026-01-01T00:00:00+09:00"))).toBe(
      "2026-01-01",
    );
  });

  it("null はそのまま null を返す", () => {
    expect(parseDateString(null)).toBeNull();
    expect(toDateString(null)).toBeNull();
    expect(toDateString(parseDateString(null))).toBeNull();
  });
});
