import { useCallback, useEffect, useState } from "react";

// saved: save succeeded / unknown: outcome unknown (e.g. network failure).
export type SaveOutcome = "saved" | "unknown";

type Params = {
  isInvalidated: boolean;
  isFetching: boolean;
  isError: boolean;
  isPaused: boolean;
  // Key for the save target (e.g. month); while showing a different target, the message is not the post-save one.
  scope?: string;
};

// Lock while waiting for the refetch after a save (shared by extra entries and recurring costs).
// Saves invalidate the list; until the refetch succeeds the displayed list is stale, and syncing/editing it would make the save look lost and get re-entered (double registration). The lock is based on isInvalidated (not component state) so it survives leaving and returning. outcome only selects the message.
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

  // Block editing until the invalidated list is refetched. Invalidation with no refetch/failure/pause (refetchType: "none") locks without a message (isStalled); beware when adding such invalidations.
  const locked = isInvalidated;
  const isStalled = isInvalidated && !isFetching && (isError || isPaused);
  const outcome =
    saved !== null && saved.scope === scope && isInvalidated
      ? saved.outcome
      : null;

  // End waiting once the refetch succeeds so a later unrelated invalidation is not mistaken for post-save waiting.
  useEffect(() => {
    if (saved && !isInvalidated && !isFetching) {
      setSaved(null);
    }
  }, [saved, isInvalidated, isFetching]);

  const markSaved = useCallback(
    (result: SaveOutcome) => setSaved({ scope, outcome: result }),
    [scope],
  );
  // E.g. moved to another month; on return, a stale list alone stops at isStalled.
  const reset = useCallback(() => setSaved(null), []);

  return { locked, isStalled, outcome, markSaved, reset };
};
