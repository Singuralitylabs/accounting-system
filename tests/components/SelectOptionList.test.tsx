// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SelectOptionList from "@/app/components/SelectOptionList";
import { notifyError } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { bulkUpsertSelectOptions, confirmAction, refresh } = vi.hoisted(() => ({
  bulkUpsertSelectOptions: vi.fn(),
  confirmAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/utils/supabase/selectOptions", () => ({
  bulkUpsertSelectOptions,
}));
vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const optionList = [
  { id: 1, value: "チームA", display_order: 1, is_active: true },
];

describe("SelectOptionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmAction.mockResolvedValue(true);
  });

  // 同じページのユーザーリストはサーバ取得の選択肢を props で受け取るため、
  // 保存後に Server Component を再描画しないと新しいチームが候補に出ない
  it("保存に成功したらページを refresh して最新の選択肢を反映する", async () => {
    bulkUpsertSelectOptions.mockResolvedValue(undefined);
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(bulkUpsertSelectOptions).toHaveBeenCalledWith(
      "team",
      expect.any(Array),
    );
  });

  it("保存に失敗した場合は refresh しない", async () => {
    bulkUpsertSelectOptions.mockRejectedValue(new Error("failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("確認ダイアログでキャンセルした場合は保存も refresh もしない", async () => {
    confirmAction.mockResolvedValue(false);
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(bulkUpsertSelectOptions).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
