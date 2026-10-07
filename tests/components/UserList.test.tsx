// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserList from "@/app/components/UserList";
import type { ProfilesType } from "@/app/types/types";
import { teamRowColor } from "@/app/utils/userListGroup";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { viewport, bulkUpdateProfiles, confirmAction, refresh } = vi.hoisted(
  () => ({
    viewport: { width: 1024 },
    bulkUpdateProfiles: vi.fn(),
    confirmAction: vi.fn(),
    refresh: vi.fn(),
  }),
);

vi.mock("@/app/utils/supabase/profiles", () => ({ bulkUpdateProfiles }));
vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.mock("@mantine/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/hooks")>();
  return {
    ...actual,
    useViewportSize: () => ({ width: viewport.width, height: 800 }),
  };
});

const makeUser = (overrides: Partial<ProfilesType>): ProfilesType => ({
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
  ...overrides,
});

const userList = [
  makeUser({}),
  makeUser({
    id: 2,
    user_id: "00000000-0000-0000-0000-000000000002",
    name: "佐藤花子",
    email: "hanako@future-tech-association.org",
    team: "旧チーム",
  }),
];
const teamList = ["チームA", "チームB"];

const editableUserList = [
  ...userList,
  makeUser({
    id: 3,
    user_id: "00000000-0000-0000-0000-000000000003",
    name: "鈴木一郎",
    email: "ichiro@future-tech-association.org",
    class: "public",
    is_teamleader: false,
    team: null,
    slack_id: null,
  }),
];

// A Select shows blank when its value is not in data (the hidden input still holds it), so assert on the display input.
const teamInputValues = () =>
  screen
    .getAllByPlaceholderText("チームを選択")
    .map((input) => (input as HTMLInputElement).value);

// Mantine Select puts aria-label on both the input and the listbox; pick the input.
const inputByLabel = (label: string) => {
  const input = screen
    .getAllByLabelText(label)
    .find((element) => element.tagName === "INPUT");
  if (!input) throw new Error(`input "${label}" not found`);
  return input as HTMLInputElement;
};

const inputValue = (label: string) => inputByLabel(label).value;

const changeSlackId = (name: string, value: string) =>
  fireEvent.change(inputByLabel(`${name}の Slack ID`), {
    target: { value },
  });

const selectOption = async (label: string, option: string) => {
  fireEvent.click(inputByLabel(label));
  fireEvent.click(await screen.findByRole("option", { name: option }));
};

const leaderCheckbox = (name: string) => {
  const input = screen
    .getAllByLabelText(`${name}のチームリーダー`)
    .find((element) => element.tagName === "INPUT");
  if (!input) throw new Error(`checkbox "${name}" not found`);
  return input as HTMLInputElement;
};

const toggleLeader = (name: string) => fireEvent.click(leaderCheckbox(name));

const saveButton = () => screen.getByRole("button", { name: "一括保存" });
const discardButton = () => screen.getByRole("button", { name: "変更を破棄" });

const changedRowNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-changed]")).map(
    (row) =>
      editableUserList.find((user) => row.textContent?.includes(user.name))
        ?.name,
  );

describe("UserList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewport.width = 1024;
    confirmAction.mockResolvedValue(true);
    bulkUpdateProfiles.mockResolvedValue({});
  });

  it.each([
    ["PC（テーブル）", 1024],
    ["モバイル（カード）", 375],
  ])(
    "%s: 初回描画から、選択肢に無いチームも含めてチームが表示される",
    (_label, width) => {
      viewport.width = width;
      renderWithMantine(<UserList userList={userList} teamList={teamList} />);

      expect(teamInputValues()).toEqual(["チームA", "旧チーム"]);
      expect(
        screen.queryByText(/チームの選択肢を取得できませんでした/),
      ).not.toBeInTheDocument();
    },
  );

  it("チームの選択肢の取得に失敗した場合は、その旨を表示し現在の値は表示を保つ", () => {
    renderWithMantine(
      <UserList userList={userList} teamList={[]} teamListError />,
    );

    expect(
      screen.getByText(/チームの選択肢を取得できませんでした/),
    ).toBeInTheDocument();
    expect(teamInputValues()).toEqual(["チームA", "旧チーム"]);
  });

  it("画面見出しは「ユーザー管理」で、権限セレクトは表示名の選択肢を PROFILE_CLASSES の順に出す", async () => {
    renderWithMantine(
      <UserList userList={editableUserList} teamList={teamList} />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "ユーザー管理" }),
    ).toBeInTheDocument();
    expect(inputValue("鈴木一郎の権限")).toBe("メンバー");
    expect(inputValue("山田太郎の権限")).toBe("メンバー");

    fireEvent.click(inputByLabel("鈴木一郎の権限"));
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["メンバー", "経理", "管理者"]);
  });

  it("各ユーザーにチームリーダーのチェックボックスがあり、フラグの値を反映する", () => {
    renderWithMantine(
      <UserList userList={editableUserList} teamList={teamList} />,
    );

    expect(leaderCheckbox("山田太郎")).toBeChecked();
    expect(leaderCheckbox("佐藤花子")).toBeChecked();
    expect(leaderCheckbox("鈴木一郎")).not.toBeChecked();
  });

  it("モバイル（カード）でも各ユーザーに「チームリーダー」の項目とチェックボックスがある", () => {
    viewport.width = 375;
    renderWithMantine(
      <UserList userList={editableUserList} teamList={teamList} />,
    );

    expect(screen.getAllByText("チームリーダー")).toHaveLength(
      editableUserList.length,
    );
    expect(leaderCheckbox("山田太郎")).toBeChecked();
  });

  it("行ごとの保存ボタンは無く、PC 表示の見出しと各行のセルの数が揃っている", () => {
    renderWithMantine(
      <UserList userList={editableUserList} teamList={teamList} />,
    );

    expect(
      screen.queryByRole("button", { name: "保存" }),
    ).not.toBeInTheDocument();
    // One table per role section, each with the same header.
    const sectionCount = 1; // public only
    const headerCells =
      screen.getAllByRole("columnheader").length / sectionCount;
    const bodyRows = screen
      .getAllByRole("row")
      .filter((row) => within(row).queryAllByRole("cell").length > 0);
    expect(bodyRows).toHaveLength(editableUserList.length);
    bodyRows.forEach((row) =>
      expect(within(row).getAllByRole("cell")).toHaveLength(headerCells),
    );
  });

  describe.each([
    ["PC（テーブル）", 1024],
    ["モバイル（カード）", 375],
  ])("%s: 権限ごとのセクションとチーム色", (_label, width) => {
    const mixedUserList = [
      makeUser({
        id: 21,
        name: "一般 次郎",
        class: "public",
        is_teamleader: false,
        team: null,
      }),
      makeUser({
        id: 22,
        name: "管理 花子",
        class: "admin",
        is_teamleader: false,
        team: null,
      }),
      makeUser({ id: 23, name: "リーダー A", team: "チームA" }),
      makeUser({ id: 24, name: "リーダー B", team: "チームB" }),
      makeUser({ id: 25, name: "リーダー 旧", team: "旧チーム" }),
      makeUser({
        id: 26,
        name: "不明 太郎",
        class: "unknown",
        is_teamleader: false,
        team: null,
      }),
      makeUser({
        id: 27,
        name: "未設定 花子",
        class: null,
        is_teamleader: false,
        team: null,
      }),
      makeUser({
        id: 28,
        name: "経理 リーダー",
        class: "accounting",
        team: "チームB",
      }),
    ];
    const headings = () =>
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    // Row (PC) / card (mobile) container of a user, found via the Slack ID input.
    const rowOf = (name: string) =>
      inputByLabel(`${name}の Slack ID`).closest(
        "tr, [data-changed], div.border-b",
      ) as HTMLElement;

    beforeEach(() => {
      viewport.width = width;
    });

    it("権限ごとに人数付きの見出しで分け、管理者 → 経理 → メンバー → 未設定の順に並べる（チームリーダーのセクションは無く、フラグ付きの経理は経理に入る）", () => {
      renderWithMantine(
        <UserList userList={mixedUserList} teamList={teamList} />,
      );

      expect(headings()).toEqual([
        "管理者（1 名）",
        "経理（1 名）",
        "メンバー（4 名）",
        "未設定（2 名）",
      ]);
      expect(inputValue("一般 次郎の権限")).toBe("メンバー");
      expect(inputValue("管理 花子の権限")).toBe("管理者");
      expect(inputValue("リーダー Aの権限")).toBe("メンバー");
      expect(inputValue("経理 リーダーの権限")).toBe("経理");
      expect(leaderCheckbox("リーダー A")).toBeChecked();
      expect(leaderCheckbox("経理 リーダー")).toBeChecked();
      expect(leaderCheckbox("一般 次郎")).not.toBeChecked();
    });

    it("チームの表示順に淡い色を割り当て、選択肢に無いチーム・チーム未設定には色を付けない", () => {
      renderWithMantine(
        <UserList userList={mixedUserList} teamList={teamList} />,
      );

      const colorOf = (name: string) => rowOf(name).style.backgroundColor;
      // jsdom normalizes hex colors to rgb().
      const normalized = (color: string | undefined) => {
        const el = document.createElement("div");
        el.style.backgroundColor = color ?? "";
        return el.style.backgroundColor;
      };
      expect(colorOf("リーダー A")).toBe(
        normalized(teamRowColor("チームA", teamList)),
      );
      expect(colorOf("リーダー B")).toBe(
        normalized(teamRowColor("チームB", teamList)),
      );
      expect(colorOf("リーダー A")).not.toBe(colorOf("リーダー B"));
      expect(colorOf("リーダー A")).not.toBe("");
      expect(colorOf("リーダー 旧")).toBe("");
      expect(colorOf("管理 花子")).toBe("");
    });

    it("変更した行は背景を変えず（黄色にしない）、変更ありバッジと左端のオレンジの線で示す", () => {
      renderWithMantine(
        <UserList userList={mixedUserList} teamList={teamList} />,
      );

      const before = rowOf("リーダー A").style.backgroundColor;
      changeSlackId("リーダー A", "U777777");

      const row = rowOf("リーダー A");
      expect(row.className).not.toContain("bg-yellow-50");
      expect(row.style.backgroundColor).toBe(before);
      expect(within(row).getByText("変更あり")).toBeInTheDocument();
      const orange = "rgb(249, 115, 22)";
      const marked = [row, ...Array.from(row.querySelectorAll("td"))].some(
        (el) =>
          (el as HTMLElement).style.boxShadow.includes("#f97316") ||
          (el as HTMLElement).style.borderLeftColor === orange,
      );
      expect(marked).toBe(true);
      expect(rowOf("リーダー B").className).not.toContain("bg-yellow-50");
      // Unchanged rows carry no marker or badge.
      expect(within(rowOf("リーダー B")).queryByText("変更あり")).toBeNull();
    });

    it("編集中に権限を変えた行は元のセクションに残り、保存に成功したら新しいセクションへ移る", async () => {
      renderWithMantine(
        <UserList userList={mixedUserList} teamList={teamList} />,
      );

      await selectOption("一般 次郎の権限", "管理者");
      expect(headings()).toEqual([
        "管理者（1 名）",
        "経理（1 名）",
        "メンバー（4 名）",
        "未設定（2 名）",
      ]);

      fireEvent.click(saveButton());
      await waitFor(() => expect(refresh).toHaveBeenCalled());

      expect(headings()).toEqual([
        "管理者（2 名）",
        "経理（1 名）",
        "メンバー（3 名）",
        "未設定（2 名）",
      ]);
    });

    it("権限が未設定の行も、権限を選んだだけでは「未設定」セクションに残り、保存に成功したら移る", async () => {
      renderWithMantine(
        <UserList userList={mixedUserList} teamList={teamList} />,
      );

      await selectOption("未設定 花子の権限", "メンバー");
      expect(headings()).toContain("未設定（2 名）");
      expect(headings()).toContain("メンバー（4 名）");

      fireEvent.click(saveButton());
      await waitFor(() => expect(refresh).toHaveBeenCalled());

      expect(headings()).toContain("メンバー（5 名）");
      expect(headings()).toContain("未設定（1 名）");
    });

    it("チームリーダーのフラグを付け外ししてもセクションは変わらない", () => {
      renderWithMantine(
        <UserList userList={mixedUserList} teamList={teamList} />,
      );

      toggleLeader("経理 リーダー");
      toggleLeader("一般 次郎");

      expect(headings()).toEqual([
        "管理者（1 名）",
        "経理（1 名）",
        "メンバー（4 名）",
        "未設定（2 名）",
      ]);
    });

    it("変更を破棄すると元のセクションのまま戻る", async () => {
      renderWithMantine(
        <UserList userList={mixedUserList} teamList={teamList} />,
      );

      await selectOption("一般 次郎の権限", "管理者");
      fireEvent.click(discardButton());

      expect(headings()).toContain("メンバー（4 名）");
      expect(inputValue("一般 次郎の権限")).toBe("メンバー");
    });
  });

  describe.each([
    ["PC（テーブル）", 1024],
    ["モバイル（カード）", 375],
  ])("%s: 表示項目と並び順", (_label, width) => {
    const unsortedUserList = [
      makeUser({
        id: 11,
        name: "一般 次郎",
        class: "public",
        is_teamleader: false,
        team: null,
      }),
      makeUser({ id: 12, name: "リーダー B", team: "チームB" }),
      makeUser({
        id: 13,
        name: "管理 花子",
        class: "admin",
        is_teamleader: false,
        team: null,
      }),
      makeUser({ id: 14, name: "リーダー 旧", team: "旧チーム" }),
      makeUser({
        id: 15,
        name: "経理 太郎",
        class: "accounting",
        is_teamleader: false,
        team: null,
      }),
      makeUser({ id: 16, name: "リーダー A", team: "チームA" }),
    ];
    const sortedNames = [
      "管理 花子",
      "経理 太郎",
      "リーダー A",
      "リーダー B",
      "リーダー 旧",
      "一般 次郎",
    ];
    const displayedNames = () =>
      screen
        .getAllByRole("textbox")
        .map((input) => input.getAttribute("aria-label") ?? "")
        .filter((label) => label.endsWith("の Slack ID"))
        .map((label) => label.replace("の Slack ID", ""));

    beforeEach(() => {
      viewport.width = width;
    });

    it("ID を表示しない", () => {
      renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      expect(screen.queryByText("ID")).not.toBeInTheDocument();
      expect(screen.queryByText("ユーザーID")).not.toBeInTheDocument();
      unsortedUserList.forEach((user) =>
        expect(screen.queryByText(String(user.id))).not.toBeInTheDocument(),
      );
    });

    it("権限 → チームリーダー → チームの表示順 → 名前の順に表示する", () => {
      renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      expect(displayedNames()).toEqual(sortedNames);
    });

    it("編集中は行の順を変えず、保存に成功したら並べ直す", async () => {
      renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      await selectOption("一般 次郎の権限", "管理者");
      toggleLeader("リーダー A");
      expect(displayedNames()).toEqual(sortedNames);

      fireEvent.click(saveButton());
      await waitFor(() => expect(refresh).toHaveBeenCalled());

      expect(displayedNames()).toEqual([
        "一般 次郎",
        "管理 花子",
        "経理 太郎",
        "リーダー B",
        "リーダー 旧",
        "リーダー A",
      ]);
    });

    it("保存に失敗したら並べ直さない", async () => {
      bulkUpdateProfiles.mockResolvedValue({
        error: {
          kind: "validationFailed",
          message: "何も保存しませんでした。",
        },
      });
      renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      await selectOption("一般 次郎の権限", "管理者");
      fireEvent.click(saveButton());
      await waitFor(() => expect(notifyError).toHaveBeenCalled());

      expect(displayedNames()).toEqual(sortedNames);
    });

    const refreshedUserList = unsortedUserList.map((user) =>
      user.id === 11 ? { ...user, class: "admin", slack_id: "U-NEW" } : user,
    );

    it("サーバの一覧が変わったら、変更が無ければ新しい値で再同期して並べ直す", () => {
      const { rerender } = renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      rerender(<UserList userList={refreshedUserList} teamList={teamList} />);

      expect(displayedNames()).toEqual([
        "一般 次郎",
        "管理 花子",
        "経理 太郎",
        "リーダー A",
        "リーダー B",
        "リーダー 旧",
      ]);
      expect(inputValue("一般 次郎の Slack ID")).toBe("U-NEW");
      expect(screen.getByText("変更はありません")).toBeInTheDocument();
    });

    it("サーバの一覧が変わっても、編集中は編集内容を保ち行も動かさない", () => {
      const { rerender } = renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      changeSlackId("経理 太郎", "U-EDIT");
      rerender(<UserList userList={refreshedUserList} teamList={teamList} />);

      expect(displayedNames()).toEqual(sortedNames);
      expect(inputValue("経理 太郎の Slack ID")).toBe("U-EDIT");
      expect(inputValue("一般 次郎の Slack ID")).toBe("U000001");
      expect(screen.getByText("1 件変更あり")).toBeInTheDocument();
    });

    it("編集中に届いた最新の一覧は、「変更を破棄」した時点で反映して並べ直す", () => {
      const { rerender } = renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      changeSlackId("経理 太郎", "U-EDIT");
      rerender(<UserList userList={refreshedUserList} teamList={teamList} />);
      fireEvent.click(discardButton());

      expect(displayedNames()).toEqual([
        "一般 次郎",
        "管理 花子",
        "経理 太郎",
        "リーダー A",
        "リーダー B",
        "リーダー 旧",
      ]);
      expect(inputValue("一般 次郎の Slack ID")).toBe("U-NEW");
      expect(inputValue("経理 太郎の Slack ID")).toBe("U000001");
      expect(screen.getByText("変更はありません")).toBeInTheDocument();
    });

    it("編集中に届いた最新の一覧は、編集した値を元に戻して変更が無くなった時点でも反映する", () => {
      const { rerender } = renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      changeSlackId("経理 太郎", "U-EDIT");
      rerender(<UserList userList={refreshedUserList} teamList={teamList} />);
      changeSlackId("経理 太郎", "U000001");

      expect(inputValue("一般 次郎の Slack ID")).toBe("U-NEW");
      expect(displayedNames()[0]).toBe("一般 次郎");
    });

    it("保存に成功した直後（再取得が届く前）に編集して破棄すると、保存した値に戻る", async () => {
      renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      changeSlackId("経理 太郎", "U-SAVED");
      fireEvent.click(saveButton());
      await waitFor(() => expect(refresh).toHaveBeenCalled());

      changeSlackId("経理 太郎", "U-AGAIN");
      fireEvent.click(discardButton());

      expect(inputValue("経理 太郎の Slack ID")).toBe("U-SAVED");
      expect(screen.getByText("変更はありません")).toBeInTheDocument();
    });

    it("編集中に届いた保存前の一覧は、次の保存の成功後に反映しない（保存した値のまま）", async () => {
      const { rerender } = renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      changeSlackId("経理 太郎", "U-1");
      fireEvent.click(saveButton());
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      changeSlackId("経理 太郎", "U-2");

      // The first refresh response (older than the second edit) arrives mid-edit.
      rerender(
        <UserList
          userList={unsortedUserList.map((user) =>
            user.id === 15 ? { ...user, slack_id: "U-1" } : user,
          )}
          teamList={teamList}
        />,
      );
      expect(inputValue("経理 太郎の Slack ID")).toBe("U-2");

      fireEvent.click(saveButton());
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
      expect(inputValue("経理 太郎の Slack ID")).toBe("U-2");
      expect(screen.getByText("変更はありません")).toBeInTheDocument();
    });
  });

  describe.each([
    ["PC（テーブル）", 1024],
    ["モバイル（カード）", 375],
  ])("%s: 一括保存", (_label, width) => {
    beforeEach(() => {
      viewport.width = width;
    });

    it("変更がない間は「一括保存」「変更を破棄」を押せず、変更すると押せる", () => {
      renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      expect(saveButton()).toBeDisabled();
      expect(discardButton()).toBeDisabled();
      expect(screen.getByText("変更はありません")).toBeInTheDocument();

      changeSlackId("鈴木一郎", "U000003");
      expect(saveButton()).toBeEnabled();
      expect(discardButton()).toBeEnabled();

      changeSlackId("鈴木一郎", "");
      expect(saveButton()).toBeDisabled();
      expect(discardButton()).toBeDisabled();
    });

    it("権限・チームリーダー・チーム・Slack ID を変えた行がハイライトされ、件数が表示される", async () => {
      const { container } = renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      changeSlackId("山田太郎", "U999999");
      expect(screen.getByText("1 件変更あり")).toBeInTheDocument();
      expect(changedRowNames(container)).toEqual(["山田太郎"]);

      await selectOption("鈴木一郎の権限", "経理");
      await selectOption("佐藤花子のチーム", "チームB");
      expect(screen.getByText("3 件変更あり")).toBeInTheDocument();
      expect(changedRowNames(container)).toEqual([
        "山田太郎",
        "佐藤花子",
        "鈴木一郎",
      ]);
      expect(screen.getAllByText("変更あり")).toHaveLength(3);
    });

    it("「変更を破棄」で読み込み時点の値に戻る", async () => {
      const { container } = renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      changeSlackId("山田太郎", "U999999");
      await selectOption("鈴木一郎の権限", "管理者");
      fireEvent.click(discardButton());

      expect(inputValue("山田太郎の Slack ID")).toBe("U000001");
      expect(inputValue("鈴木一郎の権限")).toBe("メンバー");
      expect(screen.getByText("変更はありません")).toBeInTheDocument();
      expect(changedRowNames(container)).toEqual([]);
    });

    it("チームリーダーのフラグを外すとチームが空になり、権限は変わらない", async () => {
      renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      toggleLeader("山田太郎");

      expect(leaderCheckbox("山田太郎")).not.toBeChecked();
      expect(inputValue("山田太郎のチーム")).toBe("");
      expect(inputValue("山田太郎の権限")).toBe("メンバー");
    });

    it("権限を変えてもチームは消えず、フラグを外したときだけ消える", async () => {
      renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      await selectOption("山田太郎の権限", "経理");

      expect(inputValue("山田太郎のチーム")).toBe("チームA");
      expect(leaderCheckbox("山田太郎")).toBeChecked();
    });

    it("フラグを外して読み込み時点の値に戻すと、チームも読み込み時点の値に戻り変更なしになる", async () => {
      const { container } = renderWithMantine(
        <UserList
          userList={[
            ...editableUserList,
            makeUser({
              id: 4,
              user_id: "00000000-0000-0000-0000-000000000004",
              name: "田中次郎",
              email: "jiro@future-tech-association.org",
              class: "accounting",
              team: "チームB",
              slack_id: null,
            }),
          ]}
          teamList={teamList}
        />,
      );

      toggleLeader("山田太郎");
      expect(inputValue("山田太郎のチーム")).toBe("");
      expect(screen.getByText("1 件変更あり")).toBeInTheDocument();
      toggleLeader("山田太郎");
      expect(inputValue("山田太郎のチーム")).toBe("チームA");

      toggleLeader("田中次郎");
      expect(inputValue("田中次郎のチーム")).toBe("");
      toggleLeader("田中次郎");
      expect(inputValue("田中次郎のチーム")).toBe("チームB");

      expect(screen.getByText("変更はありません")).toBeInTheDocument();
      expect(changedRowNames(container)).toEqual([]);
      expect(saveButton()).toBeDisabled();
    });

    it("チームリーダーのフラグだけを変えても変更ありになり、戻すと変更なしになる", () => {
      const { container } = renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      toggleLeader("鈴木一郎");

      expect(screen.getByText("1 件変更あり")).toBeInTheDocument();
      expect(changedRowNames(container)).toEqual(["鈴木一郎"]);

      toggleLeader("鈴木一郎");

      expect(screen.getByText("変更はありません")).toBeInTheDocument();
    });

    it("保存に成功した後は、保存したフラグ・チームを基準に戻す", async () => {
      renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      toggleLeader("鈴木一郎");
      await selectOption("鈴木一郎のチーム", "チームB");
      fireEvent.click(saveButton());
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

      toggleLeader("鈴木一郎");
      expect(inputValue("鈴木一郎のチーム")).toBe("");
      toggleLeader("鈴木一郎");
      expect(inputValue("鈴木一郎のチーム")).toBe("チームB");
      expect(screen.getByText("変更はありません")).toBeInTheDocument();
    });

    it("チームリーダーでチームを選んでいないと、保存せずにエラーを表示する", async () => {
      renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      toggleLeader("鈴木一郎");
      fireEvent.click(saveButton());

      expect(
        await screen.findByText("入力内容を確認してください"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("鈴木一郎: チームリーダーはチームが必須です。"),
      ).toBeInTheDocument();
      expect(confirmAction).not.toHaveBeenCalled();
      expect(bulkUpdateProfiles).not.toHaveBeenCalled();

      await selectOption("鈴木一郎のチーム", "チームA");
      expect(
        screen.queryByText("入力内容を確認してください"),
      ).not.toBeInTheDocument();
      fireEvent.click(saveButton());
      await waitFor(() => expect(bulkUpdateProfiles).toHaveBeenCalled());
    });

    it("経理・管理者でもフラグを付けてチームが無ければエラー、チームを選べば保存できる", async () => {
      renderWithMantine(
        <UserList
          userList={[
            makeUser({
              id: 5,
              name: "経理 花子",
              class: "accounting",
              is_teamleader: false,
              team: null,
            }),
            makeUser({
              id: 6,
              name: "管理 太郎",
              class: "admin",
              is_teamleader: false,
              team: null,
            }),
          ]}
          teamList={teamList}
        />,
      );

      toggleLeader("経理 花子");
      toggleLeader("管理 太郎");
      fireEvent.click(saveButton());

      expect(
        await screen.findByText(
          "経理 花子: チームリーダーはチームが必須です。",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("管理 太郎: チームリーダーはチームが必須です。"),
      ).toBeInTheDocument();
      expect(bulkUpdateProfiles).not.toHaveBeenCalled();

      await selectOption("経理 花子のチーム", "チームA");
      await selectOption("管理 太郎のチーム", "チームB");
      fireEvent.click(saveButton());

      await waitFor(() =>
        expect(bulkUpdateProfiles).toHaveBeenCalledWith([
          {
            id: 6,
            name: "管理 太郎",
            class: "admin",
            is_teamleader: true,
            team: "チームB",
            slack_id: "U000001",
          },
          {
            id: 5,
            name: "経理 花子",
            class: "accounting",
            is_teamleader: true,
            team: "チームA",
            slack_id: "U000001",
          },
        ]),
      );
    });

    it("確認ダイアログでキャンセルすると保存しない", async () => {
      confirmAction.mockResolvedValue(false);
      renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      changeSlackId("山田太郎", "U999999");
      fireEvent.click(saveButton());

      await waitFor(() =>
        expect(confirmAction).toHaveBeenCalledWith(
          "1 件のユーザー情報を保存しますか？",
        ),
      );
      expect(bulkUpdateProfiles).not.toHaveBeenCalled();
      expect(screen.getByText("1 件変更あり")).toBeInTheDocument();
    });

    it("保存に成功したら変更した行だけを送り、変更ありの表示を消して refresh する", async () => {
      const { container } = renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      changeSlackId("山田太郎", "U999999");
      await selectOption("鈴木一郎の権限", "経理");
      fireEvent.click(saveButton());

      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(confirmAction).toHaveBeenCalledWith(
        "2 件のユーザー情報を保存しますか？",
      );
      expect(bulkUpdateProfiles).toHaveBeenCalledWith([
        {
          id: 1,
          name: "山田太郎",
          class: "public",
          is_teamleader: true,
          team: "チームA",
          slack_id: "U999999",
        },
        {
          id: 3,
          name: "鈴木一郎",
          class: "accounting",
          is_teamleader: false,
          team: null,
          slack_id: null,
        },
      ]);
      expect(notifySuccess).toHaveBeenCalled();
      expect(screen.getByText("変更はありません")).toBeInTheDocument();
      expect(changedRowNames(container)).toEqual([]);
      expect(inputValue("山田太郎の Slack ID")).toBe("U999999");
      expect(saveButton()).toBeDisabled();
    });

    it("保存に失敗したらエラーを表示し、編集内容を画面に残す", async () => {
      bulkUpdateProfiles.mockResolvedValue({
        error: {
          kind: "validationFailed",
          message:
            "保存できないユーザーが含まれていたため、何も保存しませんでした。",
        },
      });
      const { container } = renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      changeSlackId("山田太郎", "U999999");
      fireEvent.click(saveButton());

      await waitFor(() =>
        expect(notifyError).toHaveBeenCalledWith(
          "保存できないユーザーが含まれていたため、何も保存しませんでした。",
        ),
      );
      expect(refresh).not.toHaveBeenCalled();
      expect(inputValue("山田太郎の Slack ID")).toBe("U999999");
      expect(screen.getByText("1 件変更あり")).toBeInTheDocument();
      expect(changedRowNames(container)).toEqual(["山田太郎"]);
      expect(saveButton()).toBeEnabled();
    });

    it("通信の失敗などで保存結果が分からない場合も、編集内容を画面に残す", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      bulkUpdateProfiles.mockRejectedValue(new Error("network"));
      renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      changeSlackId("山田太郎", "U999999");
      fireEvent.click(saveButton());

      await waitFor(() =>
        expect(notifyError).toHaveBeenCalledWith(
          expect.stringContaining("保存結果を確認できませんでした"),
        ),
      );
      expect(refresh).not.toHaveBeenCalled();
      expect(screen.getByText("1 件変更あり")).toBeInTheDocument();
    });
  });
});
