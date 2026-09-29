import { Alert, Button } from "@mantine/core";
import type { SaveOutcome } from "@/app/hooks/useSaveRefreshLock";

type Props = {
  // 一覧の名称（例: 経理追加収支情報）
  subject: string;
  // 保存後の再取得待ちの保存結果。保存と無関係の無効化なら null
  outcome: SaveOutcome | null;
  // 保存が複数の書き込みを別々に送り、一部だけ反映されている可能性があるか
  // （定期費用: 追加・更新・削除を並列に送る）。1 トランザクションで保存する画面
  // （経理追加収支）は false にし、「どこまで反映されたか」とは案内しない
  partialPossible?: boolean;
  isPaused: boolean;
  onReload: () => void;
};

// 保存後の再取得待ちで、最新の一覧を取得できずに編集・保存を止めているときの案内
// （useSaveRefreshLock の isStalled のときに表示する）
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
