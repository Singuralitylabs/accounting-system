import { Alert, Button } from "@mantine/core";
import type { SaveOutcome } from "@/app/hooks/useSaveRefreshLock";

type Props = {
  subject: string;
  outcome: SaveOutcome | null;
  // Whether the save sends multiple writes separately (recurring costs), so partial application is possible. False for single-transaction saves (extra entries): do not say "how far it applied".
  partialPossible?: boolean;
  isPaused: boolean;
  onReload: () => void;
};

// Shown while a post-save refetch failed to fetch the latest list and editing is blocked (isStalled of useSaveRefreshLock).
export const SaveRefreshAlert = ({
  subject,
  outcome,
  partialPossible = false,
  isPaused,
  onReload,
}: Props) => (
  <Alert
    color="yellow"
    title={
      outcome === "saved"
        ? `保存は完了しましたが、最新の${subject}を取得できませんでした`
        : outcome === "unknown"
          ? `保存できたか確認できず、最新の${subject}も取得できませんでした`
          : `最新の${subject}を取得できませんでした`
    }
    className="mb-4"
  >
    <p>
      {outcome === "saved"
        ? "表示中の内容は保存した時点のものです。"
        : outcome === "unknown"
          ? partialPossible
            ? "表示中の内容は保存しようとした時点のもので、実際に保存されたか（どこまで反映されたか）は分かりません。"
            : "表示中の内容は保存しようとした時点のもので、実際に保存されたかは分かりません。"
          : "表示中の内容は最新でない可能性があります。"}
      二重登録や上書きを防ぐため、最新の内容を取得できるまで編集・保存はできません。
      {isPaused && "通信が回復すると自動で取得します。"}
    </p>
    <Button
      type="button"
      size="xs"
      variant="light"
      className="mt-2"
      onClick={onReload}
    >
      再読み込み
    </Button>
  </Alert>
);
