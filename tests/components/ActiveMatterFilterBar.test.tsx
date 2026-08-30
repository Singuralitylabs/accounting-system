// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActiveMatterFilterBar } from "@/app/components/matterList/ActiveMatterFilterBar";
import { renderWithMantine } from "../testUtils/renderWithMantine";

describe("ActiveMatterFilterBar", () => {
  it("フィルタが無ければ何も出さない", () => {
    renderWithMantine(
      <ActiveMatterFilterBar
        filters={{}}
        onClearKey={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.queryByText("絞り込み中:")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "すべて解除" }),
    ).not.toBeInTheDocument();
  });

  it("アクティブなフィルタと解除導線を出す", () => {
    const onClearKey = vi.fn();
    const onClearAll = vi.fn();
    renderWithMantine(
      <ActiveMatterFilterBar
        filters={{ team: new Set(["開発"]) }}
        onClearKey={onClearKey}
        onClearAll={onClearAll}
      />,
    );

    expect(screen.getByText("絞り込み中:")).toBeInTheDocument();
    expect(screen.getByText("チーム: 開発")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "チームの絞り込みを解除" }),
    );
    expect(onClearKey).toHaveBeenCalledWith("team");

    fireEvent.click(screen.getByRole("button", { name: "すべて解除" }));
    expect(onClearAll).toHaveBeenCalled();
  });
});
