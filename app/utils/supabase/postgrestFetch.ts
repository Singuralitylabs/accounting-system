// PostgREST が返す PGRST303（JWT issued at future）への耐性。
//
// アプリは JWT を発行しない。access_token の iat は Supabase Auth（GoTrue）が付け、
// Data API（PostgREST）が別ホストの時計で検証する。Auth の getUser() は通る一方で
// 直後の REST が 401 になるのは、この発行側と検証側の時計ずれが原因（アプリの
// Cookie 改変やセッション再利用ではない）。
//
// PostgREST の iat 許容は約 30 秒。それを超える一時的なずれでは、同じトークンを
// 短い待ちのあと再送すると通る。新しいトークンを refresh すると iat がまた未来に
// なり、同じエラーを再生するため、ここでは refresh しない。

export const JWT_ISSUED_AT_FUTURE_CODE = "PGRST303";
export const JWT_ISSUED_AT_FUTURE_MESSAGE = "JWT issued at future";

// 再試行間隔。合計待ちは最大でも数秒に収め、RSC を長くブロックしない。
export const JWT_IAT_RETRY_DELAYS_MS = [400, 1000, 2000] as const;

// 再試行に費やしてよい待ち時間の「合計」。1 回あたりの上限ではない点に注意。
//
// middleware の `profiles` 取得は `AUTH_FETCH_TIMEOUT_MS`（5 秒）で外側から
// 打ち切られる（`app/utils/routeGuard.ts`）。1 回あたりの上限にすると
// 4 秒 × 3 回 = 12 秒まで膨らみ、外側の打ち切りに必ず食い潰されて
// 503 になるうえ、RSC でも同じ時間だけ描画をブロックする。
//
// また PGRST303 は PostgREST の iat 許容（約 30 秒）を超えたときに返るため、
// 必要な待ちがこの予算に収まらない場合は「待っても iat は現在時刻に追いつかない」
// ことが確定している。その場合は再試行せず、ただちに元の 401 を返す。
export const MAX_IAT_WAIT_MS = 4000;

export type PostgrestFetchDependencies = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export const isPostgrestUrl = (url: string) => url.includes("/rest/v1/");

export const isJwtIssuedAtFutureError = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return false;
  const { code, message } = payload as { code?: unknown; message?: unknown };
  return (
    code === JWT_ISSUED_AT_FUTURE_CODE ||
    (typeof message === "string" &&
      message.includes(JWT_ISSUED_AT_FUTURE_MESSAGE))
  );
};

export const requestUrl = (input: RequestInfo | URL) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

export const readAuthorizationHeader = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => {
  if (init?.headers) {
    return new Headers(init.headers).get("Authorization");
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.headers.get("Authorization");
  }
  return null;
};

// JWT の iat を読む（署名検証はしない。再試行待ち時間の計算にだけ使う）。
export const readJwtIat = (authorization: string | null) => {
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const payloadPart = token.split(".")[1];
  if (!payloadPart) return null;
  try {
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as { iat?: unknown };
    return typeof payload.iat === "number" ? payload.iat : null;
  } catch {
    return null;
  }
};

/**
 * 次の再試行までの待ち時間。`null` は「待っても無駄なので再試行しない」。
 *
 * `elapsedWaitMs` はこれまでの再試行で既に待った合計。残り予算
 * （`MAX_IAT_WAIT_MS - elapsedWaitMs`）に収まらない待ちは要求しない。
 */
export const delayMsForJwtIssuedAtFuture = ({
  attemptIndex,
  iatSec,
  nowMs,
  elapsedWaitMs = 0,
}: {
  attemptIndex: number;
  iatSec: number | null;
  nowMs: number;
  elapsedWaitMs?: number;
}): number | null => {
  const remainingBudget = MAX_IAT_WAIT_MS - elapsedWaitMs;
  if (remainingBudget <= 0) return null;

  const backoff =
    JWT_IAT_RETRY_DELAYS_MS[attemptIndex] ??
    JWT_IAT_RETRY_DELAYS_MS[JWT_IAT_RETRY_DELAYS_MS.length - 1];
  // iat が未来なら、その差分（+50ms の余裕）を待たないと再送しても同じ 401 になる。
  const waitForIat = iatSec == null ? 0 : iatSec * 1000 - nowMs + 50;
  const delay = Math.max(backoff, waitForIat);

  // 残り予算に収まらない＝この再試行では iat を追い越せない。
  return delay > remainingBudget ? null : delay;
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
  const now = dependencies.now ?? Date.now;

  return async (input, init) => {
    const url = requestUrl(input);
    let attempt = 0;
    let elapsedWaitMs = 0;

    while (true) {
      const response = await baseFetch(input, init);

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

      const iatSec = readJwtIat(readAuthorizationHeader(input, init));
      const nowMs = now();
      const delayMs = delayMsForJwtIssuedAtFuture({
        attemptIndex: attempt,
        iatSec,
        nowMs,
        elapsedWaitMs,
      });
      const skewSec =
        iatSec == null ? null : iatSec - Math.floor(nowMs / 1000);

      // 待ち予算を超える＝待っても iat を追い越せない。恒常的な時計ずれ
      // （Supabase 側の NTP / サポート対応が必要）はここに落ちる。
      if (delayMs === null) {
        console.warn(
          "PostgREST PGRST303 (JWT issued at future). 待ち時間の予算を超えるため再試行しません:",
          {
            attempt: attempt + 1,
            elapsedWaitMs,
            maxWaitMs: MAX_IAT_WAIT_MS,
            iatSec,
            nowSec: Math.floor(nowMs / 1000),
            skewSec,
          },
        );
        return response;
      }

      console.warn(
        "PostgREST PGRST303 (JWT issued at future). 同一トークンで再試行します（refresh はしない）:",
        {
          attempt: attempt + 1,
          maxAttempts: JWT_IAT_RETRY_DELAYS_MS.length,
          delayMs,
          elapsedWaitMs,
          iatSec,
          nowSec: Math.floor(nowMs / 1000),
          skewSec,
        },
      );

      await sleep(delayMs);
      elapsedWaitMs += delayMs;
      attempt += 1;
    }
  };
};
