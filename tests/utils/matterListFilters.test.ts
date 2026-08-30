import { describe, expect, it } from "vitest";
import {
  compactMatterListFilters,
  getActiveMatterFilterChips,
  hasMatterListFilters,
  isNumericMatterFilterKey,
  partitionCheckedMatters,
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

describe("getActiveMatterFilterChips", () => {
  it("空なら空配列", () => {
    expect(getActiveMatterFilterChips({})).toEqual([]);
    expect(getActiveMatterFilterChips({ team: new Set() })).toEqual([]);
  });

  it("値があるキーをラベル付きチップにする", () => {
    expect(
      getActiveMatterFilterChips({
        team: new Set(["開発", "営業"]),
        category: new Set(["講演"]),
      }),
    ).toEqual([
      { key: "team", label: "チーム", values: ["営業", "開発"] },
      { key: "category", label: "分類", values: ["講演"] },
    ]);
  });
});

describe("partitionCheckedMatters", () => {
  it("表示中と非表示のチェックを分ける", () => {
    expect(
      partitionCheckedMatters(
        [
          { id: 1, title: "A" },
          { id: 2, title: "B" },
        ],
        [1, 3],
      ),
    ).toEqual({
      visibleChecked: [{ id: 1, title: "A" }],
      hiddenCheckedIds: [3],
    });
  });

  it("全部表示中なら hidden は空", () => {
    expect(partitionCheckedMatters([{ id: 1 }], [1])).toEqual({
      visibleChecked: [{ id: 1 }],
      hiddenCheckedIds: [],
    });
  });
});
