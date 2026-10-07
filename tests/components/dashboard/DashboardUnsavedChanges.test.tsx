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
    class: "public",
    is_teamleader: true,
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
    bulkUpsertSelectOptions.mockResolvedValue({ insertedIds: [] });
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

    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(probe()).toBe("未保存なし");
  });

  it("非表示のカテゴリ（hidden）に未保存の変更があっても報告し続け、警告する", () => {
    renderWithMantine(
      <DashboardUnsavedChangesProvider>
        <Probe />
        <div>
          <SelectOptionList optionClass="team" optionList={teamOptions} />
        </div>
        <div hidden>
          <SelectOptionList
            optionClass="category"
            optionList={categoryOptions}
          />
        </div>
      </DashboardUnsavedChangesProvider>,
    );

    fireEvent.change(screen.getByDisplayValue("開発"), {
      target: { value: "開発2" },
    });
    expect(probe()).toBe("未保存あり");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  const fireBeforeUnload = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("ユーザー管理（UserList）に未保存の変更がある間だけ、リロード・タブを閉じる操作で警告する", () => {
    renderWithMantine(tree({ team: false, category: false }));

    expect(fireBeforeUnload()).toBe(false);
    fireEvent.change(slackIdInput(), { target: { value: "U999" } });
    expect(fireBeforeUnload()).toBe(true);
    fireEvent.change(slackIdInput(), { target: { value: "U000001" } });
    expect(fireBeforeUnload()).toBe(false);
  });

  it("項目管理（SelectOptionList）に未保存の変更がある間も警告し、保存に成功したら警告しない", async () => {
    renderWithMantine(tree({ users: false }));

    expect(fireBeforeUnload()).toBe(false);
    fireEvent.change(screen.getByDisplayValue("開発"), {
      target: { value: "開発2" },
    });
    expect(fireBeforeUnload()).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[1]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // The warning is cleared in the Provider's effect; wait for it.
    await waitFor(() => expect(fireBeforeUnload()).toBe(false));
  });

  it("警告は報告元の数によらず 1 つだけ登録し、どれか 1 つでも未保存なら警告する", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const { unmount } = renderWithMantine(tree());

    fireEvent.change(slackIdInput(), { target: { value: "U999" } });
    fireEvent.change(screen.getByDisplayValue("開発"), {
      target: { value: "開発2" },
    });
    const beforeUnloadRegistrations = () =>
      addEventListener.mock.calls.filter(([type]) => type === "beforeunload")
        .length;
    expect(beforeUnloadRegistrations()).toBe(1);

    fireEvent.change(slackIdInput(), { target: { value: "U000001" } });
    expect(fireBeforeUnload()).toBe(true);

    unmount();
    expect(fireBeforeUnload()).toBe(false);
    addEventListener.mockRestore();
  });

  it("複数の報告元のうち 1 つでも未保存なら「未保存あり」のまま", () => {
    const { rerender } = renderWithMantine(tree());

    fireEvent.change(slackIdInput(), { target: { value: "U999" } });
    fireEvent.change(screen.getByDisplayValue("開発"), {
      target: { value: "開発2" },
    });
    expect(probe()).toBe("未保存あり");

    fireEvent.change(slackIdInput(), { target: { value: "U000001" } });
    expect(probe()).toBe("未保存あり");

    rerender(tree({ category: false }));
    expect(probe()).toBe("未保存なし");
  });
});
