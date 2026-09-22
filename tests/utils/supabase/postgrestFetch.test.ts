import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JWT_IAT_RETRY_DELAYS_MS,
  createPostgrestFetch,
  isJwtIssuedAtFutureError,
  isPostgrestUrl,
  requestUrl,
} from "@/app/utils/supabase/postgrestFetch";
import {
  AUTH_FETCH_TIMEOUT_MS,
  createTimeoutFetch,
} from "@/app/utils/routeGuard";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// PostgREST の `JwtClaimsErr` はすべて PGRST303 になる。再試行してよいのは
// `JWT issued at future` だけ。
const issuedAtFuture = () =>
  jsonResponse(401, {
    code: "PGRST303",
    message: "JWT issued at future",
  });

describe("isPostgrestUrl", () => {
  it("/rest/v1/ を含む URL だけを PostgREST とみなす", () => {
    expect(
      isPostgrestUrl("https://example.supabase.co/rest/v1/select_options"),
    ).toBe(true);
    expect(isPostgrestUrl("https://example.supabase.co/auth/v1/user")).toBe(
      false,
    );
    expect(isPostgrestUrl("https://example.supabase.co/storage/v1/object")).toBe(
      false,
    );
  });
});

describe("isJwtIssuedAtFutureError", () => {
  it("メッセージ一致だけで判定する（PGRST303 は総称コードのため）", () => {
    expect(
      isJwtIssuedAtFutureError({
        code: "PGRST303",
        message: "JWT issued at future",
      }),
    ).toBe(true);
    expect(
      isJwtIssuedAtFutureError({ message: "JWT issued at future" }),
    ).toBe(true);
  });

  it("同じ PGRST303 でも他の claims エラーは対象外", () => {
    // PostgREST の Error.hs では JWTExpired / JWTNotYetValid / JWTNotInAudience /
    // ParsingClaimsFailed も PGRST303 になる。これらを再試行しても必ず失敗する。
    for (const message of [
      "JWT expired",
      "JWT not yet valid",
      "JWT not in audience",
      "Parsing claims failed",
    ]) {
      expect(isJwtIssuedAtFutureError({ code: "PGRST303", message })).toBe(
        false,
      );
    }
  });

  it("オブジェクト以外や無関係なエラーは対象外", () => {
    expect(
      isJwtIssuedAtFutureError({ code: "PGRST301", message: "JWT invalid" }),
    ).toBe(false);
    expect(isJwtIssuedAtFutureError(null)).toBe(false);
    expect(isJwtIssuedAtFutureError("JWT issued at future")).toBe(false);
  });
});

describe("requestUrl", () => {
  it("string / URL / Request を正規化する", () => {
    expect(requestUrl("https://example.test/rest/v1/x")).toBe(
      "https://example.test/rest/v1/x",
    );
    expect(requestUrl(new URL("https://example.test/rest/v1/x"))).toBe(
      "https://example.test/rest/v1/x",
    );
    expect(requestUrl(new Request("https://example.test/rest/v1/x"))).toBe(
      "https://example.test/rest/v1/x",
    );
  });
});

describe("createPostgrestFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("JWT issued at future のとき同一リクエストを再送し、成功したらそのレスポンスを返す", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(issuedAtFuture())
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1 }]));
    const sleep = vi.fn(async () => undefined);
    const wrapped = createPostgrestFetch({
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    const init = { headers: { Authorization: "Bearer token" } };
    const response = await wrapped(
      "https://example.supabase.co/rest/v1/select_options",
      init,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 同じトークンで送り直す（refresh しない）
    expect(fetchMock.mock.calls[0]?.[1]).toBe(init);
    expect(fetchMock.mock.calls[1]?.[1]).toBe(init);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(JWT_IAT_RETRY_DELAYS_MS[0]);
  });

  it("期限切れトークン（同じ PGRST303）は再試行しない", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { code: "PGRST303", message: "JWT expired" }),
      );
    const sleep = vi.fn(async () => undefined);
    const wrapped = createPostgrestFetch({
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    const response = await wrapped(
      "https://example.supabase.co/rest/v1/select_options",
    );

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("PGRST301 など別コードの 401 も再試行しない", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { code: "PGRST301", message: "JWT invalid" }),
      );
    const sleep = vi.fn(async () => undefined);
    const wrapped = createPostgrestFetch({
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    const response = await wrapped(
      "https://example.supabase.co/rest/v1/select_options",
    );

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("Auth エンドポイントは同じメッセージでも再試行しない", async () => {
    const fetchMock = vi.fn().mockResolvedValue(issuedAtFuture());
    const sleep = vi.fn(async () => undefined);
    const wrapped = createPostgrestFetch({
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    const response = await wrapped("https://example.supabase.co/auth/v1/user");

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("上限まで失敗したら最後の 401 を返す（body は読める）", async () => {
    const fetchMock = vi.fn(async () => issuedAtFuture());
    const sleep = vi.fn(async () => undefined);
    const wrapped = createPostgrestFetch({
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    const response = await wrapped(
      "https://example.supabase.co/rest/v1/select_options",
    );

    expect(response.status).toBe(401);
    // 最後に返すレスポンスの body は解放していないので読める
    expect(await response.json()).toMatchObject({
      message: "JWT issued at future",
    });
    expect(fetchMock).toHaveBeenCalledTimes(JWT_IAT_RETRY_DELAYS_MS.length + 1);
    expect(sleep).toHaveBeenCalledTimes(JWT_IAT_RETRY_DELAYS_MS.length);
  });

  it("呼び出し側が中断済みなら待たずに 401 を返す", async () => {
    const fetchMock = vi.fn(async () => issuedAtFuture());
    const sleep = vi.fn(async () => undefined);
    const wrapped = createPostgrestFetch({
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    const controller = new AbortController();
    controller.abort();

    const response = await wrapped(
      "https://example.supabase.co/rest/v1/select_options",
      { signal: controller.signal },
    );

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("再試行の合計待ち時間は middleware の外側の打ち切りより十分短い", () => {
    const total = JWT_IAT_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);
    expect(total).toBeLessThan(AUTH_FETCH_TIMEOUT_MS);
  });

  it("createTimeoutFetch と合成しても再試行が成立する", async () => {
    const inner = vi
      .fn()
      .mockResolvedValueOnce(issuedAtFuture())
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1 }]));
    const sleep = vi.fn(async () => undefined);
    const wrapped = createPostgrestFetch({
      fetch: createTimeoutFetch(
        AUTH_FETCH_TIMEOUT_MS,
        inner as unknown as typeof fetch,
      ),
      sleep,
    });

    const response = await wrapped(
      "https://example.supabase.co/rest/v1/select_options",
    );

    expect(response.status).toBe(200);
    // 再試行 1 回ごとに内側のタイムアウトが適用される
    expect(inner).toHaveBeenCalledTimes(2);
  });
});
