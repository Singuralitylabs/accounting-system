import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAllMatterInfoList } = vi.hoisted(() => ({
  getAllMatterInfoList: vi.fn(),
}));

vi.mock("@/app/utils/supabase/matters", () => ({ getAllMatterInfoList }));
vi.mock("@/app/components/MatterList", () => ({ MatterList: () => null }));

import DynamicAccounting, {
  getSlackChannelName,
} from "@/app/components/dynamic/DynamicAccounting";

type RenderedMatterList = {
  props: { children: { props: { slackChannelName?: string } } };
};

const renderedChannelName = async () => {
  const tree = (await DynamicAccounting()) as unknown as RenderedMatterList;
  return tree.props.children.props.slackChannelName;
};

describe("DynamicAccounting の投稿先チャンネル名（SLACK_CHANNEL_NAME）", () => {
  beforeEach(() => {
    getAllMatterInfoList.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("環境変数の値を前後の空白を除いて MatterList に渡す", async () => {
    vi.stubEnv("SLACK_CHANNEL_NAME", " #経理連絡 ");

    expect(getSlackChannelName()).toBe("#経理連絡");
    expect(await renderedChannelName()).toBe("#経理連絡");
  });

  it("未設定・空・空白だけなら undefined（表示しない）で、エラーにならない", async () => {
    vi.stubEnv("SLACK_CHANNEL_NAME", "");
    expect(getSlackChannelName()).toBeUndefined();
    expect(await renderedChannelName()).toBeUndefined();

    vi.stubEnv("SLACK_CHANNEL_NAME", "   ");
    expect(getSlackChannelName()).toBeUndefined();

    vi.unstubAllEnvs();
    delete process.env.SLACK_CHANNEL_NAME;
    expect(getSlackChannelName()).toBeUndefined();
  });
});
