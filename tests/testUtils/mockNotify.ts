import { vi } from "vitest";

// `@/app/utils/notify` の共有モック。
// 通知の副作用（Mantine の notifications.show）だけを vi.fn に差し替え、
// toErrorMessage は実装をそのまま使う。手書きの vi.mock を増やすと
// toErrorMessage の分岐がファイルごとにずれ、notify.ts の API 変更に追従できない。
//
// vi.mock は import より前にホイストされるため、ファクトリ内で動的 import する:
//   vi.mock("@/app/utils/notify", () =>
//     import("../testUtils/mockNotify").then((m) => m.mockNotify()),
//   );
// アサーション側はモック後の `@/app/utils/notify` から notifyError 等を import する。
export async function mockNotify() {
  const actual =
    await vi.importActual<typeof import("@/app/utils/notify")>(
      "@/app/utils/notify",
    );
  return {
    ...actual,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    notifyInfo: vi.fn(),
  };
}
