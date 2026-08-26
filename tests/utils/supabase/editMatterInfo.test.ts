import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateMatterInfo, bulkUpsertCostInfo, bulkUpsertBusinessInfo } =
  vi.hoisted(() => ({
    updateMatterInfo: vi.fn(),
    bulkUpsertCostInfo: vi.fn(),
    bulkUpsertBusinessInfo: vi.fn(),
  }));

vi.mock("@/app/utils/supabase/matters", () => ({
  updateMatterInfo,
}));

vi.mock("@/app/utils/supabase/costs", () => ({
  bulkUpsertCostInfo,
}));

vi.mock("@/app/utils/supabase/businesses", () => ({
  bulkUpsertBusinessInfo,
}));

import { updateMatter } from "@/app/utils/supabase/editMatterInfo";
import type { MatterType } from "@/app/types/types";

const matter: MatterType = {
  id: 1,
  title: "案件A",
  category: "講演",
  team: "開発",
  start_date: "2026-04-01",
  description: null,
  is_fixed: false,
  is_completed: false,
  has_updates: false,
  total_amount: 0,
  business_count: 0,
  total_cost: 0,
  cost_count: 0,
  unchecked_cost_count: 0,
  parent_matter_id: null,
  user_id: 1,
  accounting_memo: null,
  inserted_at: "",
  updated_at: "",
};

describe("updateMatter", () => {
  beforeEach(() => {
    updateMatterInfo.mockReset();
    bulkUpsertCostInfo.mockReset();
    bulkUpsertBusinessInfo.mockReset();
    bulkUpsertCostInfo.mockResolvedValue(true);
    bulkUpsertBusinessInfo.mockResolvedValue(true);
  });

  it("updateMatterInfo が error を返したら throw し、バルク更新しない", async () => {
    updateMatterInfo.mockResolvedValue({
      status: null,
      error: { message: "invalid input syntax for type date: \"\"" },
    });

    await expect(updateMatter({ ...matter, start_date: "" }, [], [])).rejects.toThrow(
      "案件の更新に失敗しました。",
    );
    expect(bulkUpsertCostInfo).not.toHaveBeenCalled();
    expect(bulkUpsertBusinessInfo).not.toHaveBeenCalled();
  });

  it("更新行が 0 件なら throw し、バルク更新しない", async () => {
    updateMatterInfo.mockResolvedValue({ status: [], error: null });

    await expect(updateMatter({ ...matter }, [], [])).rejects.toThrow(
      "案件の更新に失敗しました。",
    );
    expect(bulkUpsertCostInfo).not.toHaveBeenCalled();
    expect(bulkUpsertBusinessInfo).not.toHaveBeenCalled();
  });

  it("案件更新が成功したらコスト・取引先も更新する", async () => {
    updateMatterInfo.mockResolvedValue({ status: [{}], error: null });

    await expect(updateMatter({ ...matter }, [], [])).resolves.toBe(true);
    expect(bulkUpsertCostInfo).toHaveBeenCalled();
    expect(bulkUpsertBusinessInfo).toHaveBeenCalled();
  });
});
