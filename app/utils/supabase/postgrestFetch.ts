// Resilience to PostgREST's `JWT issued at future` (`PGRST303`), a PostgREST bug (it misreads its
// `auto-update` cached clock, so valid tokens sporadically look future-issued), fixed in 14.18 / 16.3
// (#5196). This wrapper is a stopgap: remove it once production PostgREST is >= 14.18.
//
// Retries resend the same token without refresh (the bug is on the verifier side).
// Match by message only: `PGRST303` is a generic code shared by `JWT expired`, `JWT not yet valid`,
// `JWT not in audience` and `Parsing claims failed` (PostgREST Error.hs); code-only retries would
// needlessly resend expired tokens.

export const JWT_ISSUED_AT_FUTURE_MESSAGE = "JWT issued at future";

// The upstream issue is sporadic. Keep waits short (700ms total) so they fit within the middleware
// outer timeout (AUTH_FETCH_TIMEOUT_MS = 5s) and do not block RSC rendering.
export const JWT_IAT_RETRY_DELAYS_MS = [200, 500] as const;

export type PostgrestFetchDependencies = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export const isPostgrestUrl = (url: string) => url.includes("/rest/v1/");

export const isJwtIssuedAtFutureError = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return false;
  const { message } = payload as { message?: unknown };
  return (
    typeof message === "string" &&
    message.includes(JWT_ISSUED_AT_FUTURE_MESSAGE)
  );
};

export const requestUrl = (input: RequestInfo | URL) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const readJsonPayload = async (response: Response) => {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

export const createPostgrestFetch = (
  dependencies: PostgrestFetchDependencies = {},
): typeof fetch => {
  const baseFetch = dependencies.fetch ?? fetch;
  const sleep = dependencies.sleep ?? defaultSleep;

  return async (input, init) => {
    const url = requestUrl(input);
    // A Request body can be read once, so clone each time. supabase-js passes URL + init today, but
    // this keeps a future Request input from failing with "body used already".
    const isRequestInput =
      typeof Request !== "undefined" && input instanceof Request;
    let attempt = 0;

    while (true) {
      const response = await baseFetch(
        isRequestInput ? (input as Request).clone() : input,
        init,
      );

      if (
        !isPostgrestUrl(url) ||
        response.status !== 401 ||
        attempt >= JWT_IAT_RETRY_DELAYS_MS.length
      ) {
        return response;
      }

      const payload = await readJsonPayload(response);
      if (!isJwtIssuedAtFutureError(payload)) {
        return response;
      }

      // Caller already aborted: return without waiting.
      if (init?.signal?.aborted) {
        return response;
      }

      const delayMs = JWT_IAT_RETRY_DELAYS_MS[attempt];
      console.warn(
        "PostgREST: JWT issued at future。同一トークンで再試行します（refresh はしない）:",
        {
          attempt: attempt + 1,
          maxAttempts: JWT_IAT_RETRY_DELAYS_MS.length,
          delayMs,
        },
      );

      // Release the discarded response body; undici holds the connection until GC otherwise.
      await response.body?.cancel().catch(() => undefined);
      await sleep(delayMs);
      attempt += 1;
    }
  };
};
