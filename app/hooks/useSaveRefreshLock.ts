import { useCallback, useEffect, useState } from "react";

// 保存の結果。saved = 保存に成功した / unknown = 通信の失敗などで、保存できたか
// （どこまで反映されたか）分からない
export type SaveOutcome = "saved" | "unknown";

type Params = {
  // 一覧クエリの状態（useQueryWithInvalidation の isInvalidated と useQuery の結果）
  isInvalidated: boolean;
  isFetching: boolean;
  isError: boolean;
  isPaused: boolean;
  // 保存の対象を区別するキー（月など）。保存した対象と違う対象を表示している間は、
  // 案内の文言を「保存後」にしない。対象が無い画面では省略する
  scope?: string;
};

// 保存後の再取得待ちのロック（経理追加収支・定期費用の一覧で共通。Issue #170, #190）。
//
// 保存・前月コピー・確定などで一覧クエリは無効化される。再取得に成功して無効化が解けるまでは、
// 表示中の一覧が保存前の古いものである（保存した新規行を含まない・どこまで反映されたか
// 分からない）ため、そのまま同期・編集させると保存が消えたように見えて入力し直され、
// 二重に登録されうる。そこで、一覧が無効化されている間は同期と編集・保存を止める（locked）。
// 画面を離れて戻った場合もキャッシュに残る無効化で判定できるよう、ロックの条件は
// コンポーネントの state ではなく isInvalidated に置く。outcome は案内の文言を選ぶだけに使う。
export const useSaveRefreshLock = ({
  isInvalidated,
  isFetching,
  isError,
  isPaused,
  scope,
}: Params) => {
  const [saved, setSaved] = useState<{
    scope: string | undefined;
    outcome: SaveOutcome;
  } | null>(null);

  // 無効化された一覧の再取得が済んでいない間は編集・保存を止める。再取得中・取得失敗・
  // 一時停止のいずれでもなく無効化されたまま残る状態（refetchType: "none" での無効化など）は
  // 案内（isStalled）が出ないままロックだけがかかるため、そのような無効化を追加するときは注意する
  const locked = isInvalidated;
  // 再取得を試みたが取得できていない（失敗・オフラインで一時停止）
  const isStalled = isInvalidated && !isFetching && (isError || isPaused);
  // 保存した対象の一覧が、保存後の再取得を待っている間の保存結果
  const outcome =
    saved !== null && saved.scope === scope && isInvalidated
      ? saved.outcome
      : null;

  // 再取得に成功して無効化が解けたら待ち状態を終える（後で別の理由で無効化された
  // ときに、保存後の待ちと取り違えないようにする）
  useEffect(() => {
    if (saved && !isInvalidated && !isFetching) {
      setSaved(null);
    }
  }, [saved, isInvalidated, isFetching]);

  const markSaved = useCallback(
    (result: SaveOutcome) => setSaved({ scope, outcome: result }),
    [scope],
  );
  // 別の対象（月）に移ったときなど。戻ったときに古い一覧しか無ければ isStalled で止まる
  const reset = useCallback(() => setSaved(null), []);

  return { locked, isStalled, outcome, markSaved, reset };
};
