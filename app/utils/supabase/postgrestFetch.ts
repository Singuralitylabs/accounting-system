// PostgREST が返す `JWT issued at future`（`PGRST303`）への耐性。
//
// 原因はアプリでも Supabase の設定でもなく、**PostgREST 側の不具合**だった。
// PostgREST は現在時刻を `auto-update` でキャッシュしており、これを誤って読むため
// 有効なトークンでも散発的に `iat` が未来と判定される。上流の報告（#5172）では、
// キャッシュをやめて `getCurrentTime` を直接使うと事象が消えることが確認されている。
// 修正は **14.18（2026-09-10）/ 16.3（2026-09-11）** で入った（CHANGELOG の
// 「Fix sporadic "PGRST303 JWT issued at future" errors」/ #5196）。
//
// したがって本ラッパは恒久対策ではなく、修正前のバージョンが動いている間の保険。
// 本番の PostgREST が 14.18 以上であることを確認できたら削除してよい。
//
// 再送は refresh を伴わない。新しいトークンを取り直しても `iat` は再び「未来」と
// 判定され得るし、そもそも不具合は検証側にあるため、同じトークンを送り直す。
//
// 判定は**メッセージ一致のみ**で行う。`PGRST303` は `JwtClaimsErr` 全般に付く
// 総称コードで、`JWT expired` / `JWT not yet valid` / `JWT not in audience` /
// `Parsing claims failed` も同じコードになる（PostgREST の `Error.hs`）。
// コードだけで再試行すると、期限切れトークンを無駄に再送してしまう。

export const JWT_ISSUED_AT_FUTURE_MESSAGE = "JWT issued at future";

// 再試行間隔。上流の事象は散発的で、キャッシュされた時刻が更新されれば通る。
// 待ちを短く保ち、middleware の外側の打ち切り（`AUTH_FETCH_TIMEOUT_MS` = 5 秒）や
// RSC の描画を意味のある長さブロックしない（合計 700ms）。
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
    // `Request` の body は 1 度しか読めないため、再送に備えて毎回複製する。
    // supabase-js は文字列 URL + init を渡すので現状この分岐は通らないが、
    // 将来 `Request` を渡されても 2 回目が「body used already」にならないようにする。
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

      // 呼び出し側が既に中断している場合は、待たずにそのまま返す。
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

      // 破棄するレスポンスの body を解放する。undici では未消費のままだと
      // GC まで接続が保持される。
      await response.body?.cancel().catch(() => undefined);
      await sleep(delayMs);
      attempt += 1;
    }
  };
};
