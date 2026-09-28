// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserList from "@/app/components/UserList";
import type { ProfilesType } from "@/app/types/types";
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
  class: "teamleader",
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

// 一括保存の確認用（権限・チーム未設定の一般ユーザーを含む 3 人）
const editableUserList = [
  ...userList,
  makeUser({
    id: 3,
    user_id: "00000000-0000-0000-0000-000000000003",
    name: "鈴木一郎",
    email: "ichiro@future-tech-association.org",
    class: "public",
    team: null,
    slack_id: null,
  }),
];

// Select は value が data に無いと表示欄が空になる（hidden input には値が入る）ため、
// 表示用の input の値で確認する
const teamInputValues = () =>
  screen
    .getAllByPlaceholderText("チームを選択")
    .map((input) => (input as HTMLInputElement).value);

// Mantine の Select は aria-label を入力欄とドロップダウン（listbox）の両方に付けるため、
// 入力欄（input）を選ぶ
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

const saveButton = () => screen.getByRole("button", { name: "一括保存" });
const discardButton = () => screen.getByRole("button", { name: "変更を破棄" });

// 変更ありとしてハイライトされている行（PC は tr、モバイルはカード）の名前
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

  it("行ごとの保存ボタンは無く、PC 表示の見出しと各行のセルの数が揃っている", () => {
    renderWithMantine(
      <UserList userList={editableUserList} teamList={teamList} />,
    );

    expect(
      screen.queryByRole("button", { name: "保存" }),
    ).not.toBeInTheDocument();
    const headerCells = screen.getAllByRole("columnheader").length;
    const [, ...bodyRows] = screen.getAllByRole("row");
    expect(bodyRows).toHaveLength(editableUserList.length);
    bodyRows.forEach((row) =>
      expect(within(row).getAllByRole("cell")).toHaveLength(headerCells),
    );
  });

  describe.each([
    ["PC（テーブル）", 1024],
    ["モバイル（カード）", 375],
  ])("%s: 表示項目と並び順", (_label, width) => {
    // id 順（取得順）では権限もチームもばらばらになるユーザー
    const unsortedUserList = [
      makeUser({ id: 11, name: "一般 次郎", class: "public", team: null }),
      makeUser({
        id: 12,
        name: "リーダー B",
        class: "teamleader",
        team: "チームB",
      }),
      makeUser({ id: 13, name: "管理 花子", class: "admin", team: null }),
      makeUser({
        id: 14,
        name: "リーダー 旧",
        class: "teamleader",
        team: "旧チーム",
      }),
      makeUser({ id: 15, name: "経理 太郎", class: "accounting", team: null }),
      makeUser({
        id: 16,
        name: "リーダー A",
        class: "teamleader",
        team: "チームA",
      }),
    ];
    const sortedNames = [
      "管理 花子",
      "経理 太郎",
      "リーダー A",
      "リーダー B",
      // 選択肢に無いチームは選択肢のチームの後ろ
      "リーダー 旧",
      "一般 次郎",
    ];
    // 画面に並んでいる順のユーザー名（Slack ID 欄の aria-label から読む）
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

    it("権限 → チームの表示順 → 名前の順に表示する", () => {
      renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      expect(displayedNames()).toEqual(sortedNames);
    });

    it("編集中は行の順を変えず、保存に成功したら並べ直す", async () => {
      renderWithMantine(
        <UserList userList={unsortedUserList} teamList={teamList} />,
      );

      // 一般ユーザーを admin に、リーダー A を public に変える
      await selectOption("一般 次郎の権限", "admin");
      await selectOption("リーダー Aの権限", "public");
      expect(displayedNames()).toEqual(sortedNames);

      fireEvent.click(saveButton());
      await waitFor(() => expect(refresh).toHaveBeenCalled());

      expect(displayedNames()).toEqual([
        // admin 同士は名前順
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

      await selectOption("一般 次郎の権限", "admin");
      fireEvent.click(saveButton());
      await waitFor(() => expect(notifyError).toHaveBeenCalled());

      expect(displayedNames()).toEqual(sortedNames);
    });

    // router.refresh() 等でサーバから新しい一覧を受け取ったとき
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

      // 読み込み時点の古い値ではなく、届いていた最新の一覧になる
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

      // 再取得前の古い props（U000001）ではなく、保存した値に戻る
      expect(inputValue("経理 太郎の Slack ID")).toBe("U-SAVED");
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

      // 元の値に戻したら変更なしに戻る
      changeSlackId("鈴木一郎", "");
      expect(saveButton()).toBeDisabled();
      expect(discardButton()).toBeDisabled();
    });

    it("権限・チーム・Slack ID を変えた行がハイライトされ、件数が表示される", async () => {
      const { container } = renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      changeSlackId("山田太郎", "U999999");
      expect(screen.getByText("1 件変更あり")).toBeInTheDocument();
      expect(changedRowNames(container)).toEqual(["山田太郎"]);

      await selectOption("鈴木一郎の権限", "accounting");
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
      await selectOption("鈴木一郎の権限", "admin");
      fireEvent.click(discardButton());

      expect(inputValue("山田太郎の Slack ID")).toBe("U000001");
      expect(inputValue("鈴木一郎の権限")).toBe("public");
      expect(screen.getByText("変更はありません")).toBeInTheDocument();
      expect(changedRowNames(container)).toEqual([]);
    });

    it("teamleader 以外に変えるとチームが空になる", async () => {
      renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      await selectOption("山田太郎の権限", "accounting");

      expect(inputValue("山田太郎のチーム")).toBe("");
    });

    it("teamleader でチームを選んでいないと、保存せずにエラーを表示する", async () => {
      renderWithMantine(
        <UserList userList={editableUserList} teamList={teamList} />,
      );

      await selectOption("鈴木一郎の権限", "teamleader");
      fireEvent.click(saveButton());

      expect(
        await screen.findByText("入力内容を確認してください"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("鈴木一郎: チームリーダーはチームが必須です。"),
      ).toBeInTheDocument();
      expect(confirmAction).not.toHaveBeenCalled();
      expect(bulkUpdateProfiles).not.toHaveBeenCalled();

      // チームを選ぶとエラーが消え、保存できる
      await selectOption("鈴木一郎のチーム", "チームA");
      expect(
        screen.queryByText("入力内容を確認してください"),
      ).not.toBeInTheDocument();
      fireEvent.click(saveButton());
      await waitFor(() => expect(bulkUpdateProfiles).toHaveBeenCalled());
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
      await selectOption("鈴木一郎の権限", "accounting");
      fireEvent.click(saveButton());

      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(confirmAction).toHaveBeenCalledWith(
        "2 件のユーザー情報を保存しますか？",
      );
      expect(bulkUpdateProfiles).toHaveBeenCalledWith([
        {
          id: 1,
          name: "山田太郎",
          class: "teamleader",
          team: "チームA",
          slack_id: "U999999",
        },
        {
          id: 3,
          name: "鈴木一郎",
          class: "accounting",
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

  it("未保存の変更がある間だけ、リロード・タブを閉じる操作で警告する", () => {
    renderWithMantine(
      <UserList userList={editableUserList} teamList={teamList} />,
    );
    const fireBeforeUnload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(fireBeforeUnload()).toBe(false);
    changeSlackId("山田太郎", "U999999");
    expect(fireBeforeUnload()).toBe(true);
    fireEvent.click(discardButton());
    expect(fireBeforeUnload()).toBe(false);
  });
});
