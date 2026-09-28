// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DashboardUnsavedChangesProvider,
  useDashboardHasUnsavedChanges,
} from "@/app/components/dashboard/DashboardUnsavedChanges";
import SelectOptionList from "@/app/components/SelectOptionList";
import UserList from "@/app/components/UserList";
import type { ProfilesType } from "@/app/types/types";
import { renderWithMantine } from "../../testUtils/renderWithMantine";

const { bulkUpdateProfiles, bulkUpsertSelectOptions, confirmAction, refresh } =
  vi.hoisted(() => ({
    bulkUpdateProfiles: vi.fn(),
    bulkUpsertSelectOptions: vi.fn(),
    confirmAction: vi.fn(),
    refresh: vi.fn(),
  }));

vi.mock("@/app/utils/supabase/profiles", () => ({ bulkUpdateProfiles }));
vi.mock("@/app/utils/supabase/selectOptions", () => ({
  bulkUpsertSelectOptions,
}));
vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@mantine/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/hooks")>();
  return {
    ...actual,
    useViewportSize: () => ({ width: 1024, height: 800 }),
  };
});

const userList: ProfilesType[] = [
  {
    id: 1,
    user_id: "00000000-0000-0000-0000-000000000001",
    name: "山田太郎",
    email: "taro@future-tech-association.org",
    class: "teamleader",
    team: "チームA",
    slack_id: "U000001",
    inserted_at: "2026-01-01T00:00:00+09:00",
    updated_at: "2026-01-01T00:00:00+09:00",
  },
];
const teamOptions = [
  { id: 1, value: "チームA", display_order: 1, is_active: true },
];
const categoryOptions = [
  { id: 11, value: "開発", display_order: 1, is_active: true },
];

// DashboardNav の代わりに、Provider がまとめた「未保存の変更あり」を表示する
const Probe = () => (
  <p data-testid="probe">
    {useDashboardHasUnsavedChanges() ? "未保存あり" : "未保存なし"}
  </p>
);
const probe = () => screen.getByTestId("probe").textContent;

const slackIdInput = () =>
  screen
    .getAllByLabelText("山田太郎の Slack ID")
    .find((element) => element.tagName === "INPUT") as HTMLInputElement;

type Shown = { users?: boolean; team?: boolean; category?: boolean };
const tree = ({ users = true, team = true, category = true }: Shown = {}) => (
  <DashboardUnsavedChangesProvider>
    <Probe />
    {users && <UserList userList={userList} teamList={["チームA"]} />}
    {team && <SelectOptionList optionClass="team" optionList={teamOptions} />}
    {category && (
      <SelectOptionList optionClass="category" optionList={categoryOptions} />
    )}
  </DashboardUnsavedChangesProvider>
);

describe("管理画面の未保存の変更の共有（DashboardUnsavedChangesProvider）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmAction.mockResolvedValue(true);
    bulkUpsertSelectOptions.mockResolvedValue(undefined);
  });

  it("UserList の未保存の変更を報告し、値を戻すと解除する", () => {
    renderWithMantine(tree({ team: false, category: false }));
    expect(probe()).toBe("未保存なし");

    fireEvent.change(slackIdInput(), { target: { value: "U999" } });
    expect(probe()).toBe("未保存あり");

    fireEvent.change(slackIdInput(), { target: { value: "U000001" } });
    expect(probe()).toBe("未保存なし");
  });

  it("UserList が未保存のまま画面から外れたら（アンマウント）解除する", () => {
    const { rerender } = renderWithMantine(
      tree({ team: false, category: false }),
    );
    fireEvent.change(slackIdInput(), { target: { value: "U999" } });
    expect(probe()).toBe("未保存あり");

    rerender(tree({ users: false, team: false, category: false }));

    expect(probe()).toBe("未保存なし");
  });

  it("項目管理の SelectOptionList の未保存の変更も報告し、保存に成功したら解除する", async () => {
    renderWithMantine(tree({ users: false }));

    fireEvent.change(screen.getByDisplayValue("チームA"), {
      target: { value: "チームA2" },
    });
    expect(probe()).toBe("未保存あり");

    fireEvent.click(screen.getAllByRole("button", { name: "更新" })[0]);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(probe()).toBe("未保存なし");
  });

  it("複数の報告元のうち 1 つでも未保存なら「未保存あり」のまま", () => {
    const { rerender } = renderWithMantine(tree());

    fireEvent.change(slackIdInput(), { target: { value: "U999" } });
    fireEvent.change(screen.getByDisplayValue("開発"), {
      target: { value: "開発2" },
    });
    expect(probe()).toBe("未保存あり");

    // UserList だけ元に戻しても、分類のカードが未保存のまま
    fireEvent.change(slackIdInput(), { target: { value: "U000001" } });
    expect(probe()).toBe("未保存あり");

    // 分類のカードが画面から外れたら、未保存の報告元が無くなる
    rerender(tree({ category: false }));
    expect(probe()).toBe("未保存なし");
  });
});
