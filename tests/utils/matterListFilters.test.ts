import { describe, expect, it } from "vitest";
import {
  compactMatterListFilters,
  hasMatterListFilters,
  isNumericMatterFilterKey,
} from "@/app/utils/matterListFilters";

describe("compactMatterListFilters", () => {
  it("空の Set と未知キーを落とす", () => {
    expect(
      compactMatterListFilters({
        team: new Set(),
        unknown: new Set(["x"]),
      }),
    ).toEqual({});
  });

  it("値があるキーだけをソート済み配列にする", () => {
    expect(
      compactMatterListFilters({
        team: new Set(["B", "A"]),
        category: new Set(["講演"]),
        title: new Set(),
      }),
    ).toEqual({
      team: ["A", "B"],
      category: ["講演"],
    });
  });
});

describe("hasMatterListFilters", () => {
  it("空オブジェクトは false", () => {
    expect(hasMatterListFilters({})).toBe(false);
  });

  it("空配列だけのキーは false", () => {
    expect(hasMatterListFilters({ team: [] })).toBe(false);
  });

  it("1つでも値があれば true", () => {
    expect(hasMatterListFilters({ team: ["開発"] })).toBe(true);
  });
});

describe("isNumericMatterFilterKey", () => {
  it("金額・件数・ID は numeric", () => {
    expect(isNumericMatterFilterKey("id")).toBe(true);
    expect(isNumericMatterFilterKey("total_amount")).toBe(true);
    expect(isNumericMatterFilterKey("unchecked_cost_count")).toBe(true);
  });

  it("文字列カラムは numeric ではない", () => {
    expect(isNumericMatterFilterKey("team")).toBe(false);
    expect(isNumericMatterFilterKey("user_name")).toBe(false);
    expect(isNumericMatterFilterKey("title")).toBe(false);
  });
});
