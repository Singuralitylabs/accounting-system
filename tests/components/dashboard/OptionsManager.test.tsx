// @vitest-environment jsdom

import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OptionsManager, {
  type OptionsManagerCategory,
} from "@/app/components/dashboard/OptionsManager";
import { OPTION_CLASSES } from "@/app/utils/selectOptionClasses";
import { renderWithMantine } from "../../testUtils/renderWithMantine";

const { viewport, searchParams } = vi.hoisted(() => ({
  viewport: { width: 1024 },
  searchParams: { type: null as string | null },
}));

vi.mock("@/app/utils/supabase/selectOptions", () => ({
  bulkUpsertSelectOptions: vi.fn(),
}));
vi.mock("@/app/utils/confirmAction", () => ({ confirmAction: vi.fn() }));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => ({ get: () => searchParams.type }),
}));
vi.mock("@mantine/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/hooks")>();
  return {
    ...actual,
    useViewportSize: () => ({ width: viewport.width, height: 800 }),
  };
});

const categories = (
  overrides: Partial<Record<string, Partial<OptionsManagerCategory>>> = {},
): OptionsManagerCategory[] =>
  OPTION_CLASSES.map(({ optionClass, label }) => ({
    optionClass,
    options: [
      { id: 1, value: `${label}の項目`, display_order: 1, is_active: true },
      { id: 2, value: `${label}の項目2`, display_order: 2, is_active: true },
    ],
    hasError: false,
    ...overrides[optionClass],
  }));

const nav = () => screen.getByRole("navigation", { name: "項目の種類" });

describe("OptionsManager", () => {
  beforeEach(() => {
    viewport.width = 1024;
    searchParams.type = null;
    window.history.replaceState(null, "", "/dashboard/options");
  });

  it("PC では左にグループ付きのカテゴリ一覧、右に選択中のカテゴリのパネルを表示する", () => {
    renderWithMantine(<OptionsManager categories={categories()} />);

    expect(screen.getByText("案件・費用で使う項目")).toBeInTheDocument();
    expect(screen.getByText("追加収支で使う項目")).toBeInTheDocument();
    expect(within(nav()).getByText("決済方法")).toBeInTheDocument();
    expect(
      within(nav()).getByRole("button", { name: /^チーム/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByDisplayValue("チームの項目")).toBeVisible();
    expect(screen.queryByDisplayValue("品目の項目")).not.toBeVisible();
  });

  it("カテゴリ一覧の件数バッジを表示する", () => {
    renderWithMantine(<OptionsManager categories={categories()} />);

    expect(
      within(nav()).getByRole("button", { name: /^品目/ }),
    ).toHaveTextContent("2");
  });

  it("カテゴリを切り替えても編集中の内容が残り、一覧に未保存のドットを表示する", () => {
    renderWithMantine(<OptionsManager categories={categories()} />);

    fireEvent.change(screen.getByDisplayValue("チームの項目"), {
      target: { value: "チームの項目（編集）" },
    });
    expect(screen.getByLabelText("未保存の変更あり")).toBeInTheDocument();

    fireEvent.click(within(nav()).getByRole("button", { name: /^品目/ }));
    expect(screen.getByDisplayValue("品目の項目")).toBeVisible();
    expect(
      screen.queryByDisplayValue("チームの項目（編集）"),
    ).not.toBeVisible();

    fireEvent.click(within(nav()).getByRole("button", { name: /^チーム/ }));
    expect(screen.getByDisplayValue("チームの項目（編集）")).toBeVisible();
    expect(screen.getByLabelText("未保存の変更あり")).toBeInTheDocument();
  });

  it("選択中のカテゴリを URL のクエリに反映し、クエリで指定したカテゴリを最初に開く", () => {
    const { unmount } = renderWithMantine(
      <OptionsManager categories={categories()} />,
    );
    fireEvent.click(within(nav()).getByRole("button", { name: /^品目/ }));
    expect(window.location.search).toBe("?type=item");
    unmount();

    searchParams.type = "payment_method";
    renderWithMantine(<OptionsManager categories={categories()} />);
    expect(screen.getByDisplayValue("決済方法の項目")).toBeVisible();
  });

  it("取得に失敗したカテゴリは、一覧に失敗マークを出し、パネルにエラーを表示する", () => {
    renderWithMantine(
      <OptionsManager
        categories={categories({
          payment_method: { options: [], hasError: true },
        })}
      />,
    );

    expect(
      within(nav()).getByRole("button", { name: /^決済方法/ }),
    ).toHaveTextContent("失敗");
    fireEvent.click(within(nav()).getByRole("button", { name: /^決済方法/ }));
    expect(
      screen.getByText("決済方法情報の取得に失敗しました。"),
    ).toBeVisible();
  });

  describe("モバイル（768px 未満）", () => {
    beforeEach(() => {
      viewport.width = 375;
    });

    it("カテゴリ一覧の代わりに Select で切り替える", () => {
      renderWithMantine(<OptionsManager categories={categories()} />);

      expect(
        screen.queryByRole("navigation", { name: "項目の種類" }),
      ).not.toBeInTheDocument();
      const select = screen.getByRole("textbox", { name: "編集する項目" });
      expect(select).toHaveValue("チーム（2件）");

      fireEvent.click(select);
      fireEvent.click(screen.getByRole("option", { name: "品目（2件）" }));

      expect(screen.getByDisplayValue("品目の項目")).toBeVisible();
    });

    it("未保存の変更がある間だけ、Select に「● 未保存」と画面下の固定バーを表示する", () => {
      renderWithMantine(<OptionsManager categories={categories()} />);
      expect(screen.queryByText("変更を破棄")).not.toBeInTheDocument();

      fireEvent.change(screen.getByDisplayValue("チームの項目"), {
        target: { value: "編集" },
      });

      expect(screen.getByRole("textbox", { name: "編集する項目" })).toHaveValue(
        "チーム（2件） ● 未保存",
      );
      expect(screen.getByRole("button", { name: "変更を破棄" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    });
  });
});
