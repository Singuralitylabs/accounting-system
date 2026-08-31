import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteMatterInfo, deleteCostsByMatterId, deleteBusinessesByMatterId } =
  vi.hoisted(() => ({
    deleteMatterInfo: vi.fn(),
    deleteCostsByMatterId: vi.fn(),
    deleteBusinessesByMatterId: vi.fn(),
  }));

vi.mock("@/app/utils/supabase/matters", () => ({
  deleteMatterInfo,
}));

// 明細の先行削除が復活していないことを検知するためのスパイ
// （現在の deleteMatter はこれらを import しない）
vi.mock("@/app/utils/supabase/costs", () => ({
  deleteCostsByMatterId,
}));

vi.mock("@/app/utils/supabase/businesses", () => ({
  deleteBusinessesByMatterId,
}));

import deleteMatter from "@/app/utils/supabase/deleteMatter";
import { NO_ROWS_DELETED } from "@/app/utils/supabase/errorCodes";
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

describe("deleteMatter", () => {
  beforeEach(() => {
    deleteMatterInfo.mockReset();
    deleteCostsByMatterId.mockReset();
    deleteBusinessesByMatterId.mockReset();
  });

  it("明細を先行削除せず、案件本体の削除だけを行う（CASCADE に任せる）", async () => {
    deleteMatterInfo.mockResolvedValue({ status: [{ id: 1 }], error: null });

    await expect(deleteMatter(matter)).resolves.toBe(true);

    expect(deleteMatterInfo).toHaveBeenCalledWith(1);
    expect(deleteCostsByMatterId).not.toHaveBeenCalled();
    expect(deleteBusinessesByMatterId).not.toHaveBeenCalled();
  });

  it("案件本体の削除が失敗したら throw する", async () => {
    deleteMatterInfo.mockResolvedValue({
      status: null,
      error: { code: "42501", message: "permission denied for table matters" },
    });

    await expect(deleteMatter(matter)).rejects.toThrow(
      "案件情報の削除に失敗しました。",
    );
  });

  it("削除 0 行は DB 障害と区別できるメッセージで throw する", async () => {
    deleteMatterInfo.mockResolvedValue({
      status: null,
      error: {
        code: NO_ROWS_DELETED,
        message: "案件ID : 1の削除対象が見つかりませんでした。",
      },
    });

    await expect(deleteMatter(matter)).rejects.toThrow(
      "案件が見つかりませんでした。既に削除されているか、削除する権限がありません。",
    );
  });
});
