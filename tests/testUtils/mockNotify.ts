import { vi } from "vitest";

// Shared mock for `@/app/utils/notify`. Replaces only the notification side effect (Mantine's
// notifications.show) with vi.fn and keeps the real toErrorMessage; hand-written vi.mock copies would let
// toErrorMessage branches drift per file and miss notify.ts API changes.
//
// vi.mock is hoisted above imports, so import dynamically inside the factory.
// `@` is the repo root, so this is independent of test depth:
//   vi.mock("@/app/utils/notify", () =>
//     import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
//   );
// Import notifyError etc. for assertions from the mocked `@/app/utils/notify`.
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
