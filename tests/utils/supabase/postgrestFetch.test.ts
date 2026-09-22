import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JWT_IAT_RETRY_DELAYS_MS,
  MAX_IAT_WAIT_MS,
  createPostgrestFetch,
  delayMsForJwtIssuedAtFuture,
  isJwtIssuedAtFutureError,
  isPostgrestUrl,
  readAuthorizationHeader,
  readJwtIat,
  requestUrl,
} from "@/app/utils/supabase/postgrestFetch";

const fakeToken = (payload: unknown) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const pgrst303 = () =>
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
  it("PGRST303 またはメッセージで判定する", () => {
    expect(
      isJwtIssuedAtFutureError({
        code: "PGRST303",
        message: "JWT issued at future",
      }),
    ).toBe(true);
    expect(
      isJwtIssuedAtFutureError({ message: "JWT issued at future" }),
    ).toBe(true);
    expect(
      isJwtIssuedAtFutureError({
        code: "PGRST301",
        message: "JWT expired",
      }),
    ).toBe(false);
    expect(isJwtIssuedAtFutureError(null)).toBe(false);
    expect(isJwtIssuedAtFutureError("JWT issued at future")).toBe(false);
  });
});

describe("readJwtIat / request helpers", () => {
  it("Bearer JWT から iat を読む", () => {
    expect(readJwtIat(`Bearer ${fakeToken({ iat: 1_700_000_000 })}`)).toBe(
      1_700_000_000,
    );
    expect(readJwtIat(null)).toBeNull();
    expect(readJwtIat("Bearer not-a-jwt")).toBeNull();
    expect(readJwtIat(`Bearer ${fakeToken({ sub: "user" })}`)).toBeNull();
  });

  it("Authorization ヘッダを init または Request から読む", () => {
    expect(
      readAuthorizationHeader("https://example.supabase.co/rest/v1/x", {
        headers: { Authorization: "Bearer abc" },
      }),
    ).toBe("Bearer abc");
    expect(
      readAuthorizationHeader(
        new Request("https://example.supabase.co/rest/v1/x", {
          headers: { Authorization: "Bearer from-request" },
        }),
      ),
    ).toBe("Bearer from-request");
  });

  it("requestUrl は string / URL / Request を正規化する", () => {
    expect(requestUrl("https://example.test/rest/v1/x")).toBe(
      "https://example.test/rest/v1/x",
    );
    expect(requestUrl(new URL("https://example.test/rest/v1/x"))).toBe(
      "https://example.test/rest/v1/x",
    );
    expect(
      requestUrl(new Request("https://example.test/rest/v1/x")),
    ).toBe("https://example.test/rest/v1/x");
  });
});

describe("delayMsForJwtIssuedAtFuture", () => {
  it("iat が過去または不明ならバックオフだけ使う", () => {
    expect(
      delayMsForJwtIssuedAtFuture({
        attemptIndex: 0,
        iatSec: 100,
        nowMs: 100_000,
      }),
    ).toBe(JWT_IAT_RETRY_DELAYS_MS[0]);
    expect(
      delayMsForJwtIssuedAtFuture({
        attemptIndex: 1,
        iatSec: null,
        nowMs: 0,
      }),
    ).toBe(JWT_IAT_RETRY_DELAYS_MS[1]);
  });

  it("iat が未来ならその差分を待つ（予算内なら再試行する）", () => {
    expect(
      delayMsForJwtIssuedAtFuture({
        attemptIndex: 0,
        iatSec: 12,
        nowMs: 10_000,
      }),
    ).toBe(2_050);
  });

  it("必要な待ちが予算を超えるなら再試行しない（null を返す）", () => {
    // ずれが 10 秒。4 秒待っても iat を追い越せないため待たない。
    expect(
      delayMsForJwtIssuedAtFuture({
        attemptIndex: 0,
        iatSec: 20,
        nowMs: 10_000,
      }),
    ).toBeNull();
  });

  it("既に待った分を差し引いた残り予算で判定する", () => {
    // 残り 1 秒に対してバックオフ 2 秒は収まらない。
    expect(
      delayMsForJwtIssuedAtFuture({
        attemptIndex: 2,
        iatSec: null,
        nowMs: 0,
        elapsedWaitMs: MAX_IAT_WAIT_MS - 1_000,
      }),
    ).toBeNull();
    // 予算を使い切っていれば無条件に再試行しない。
    expect(
      delayMsForJwtIssuedAtFuture({
        attemptIndex: 0,
        iatSec: null,
        nowMs: 0,
        elapsedWaitMs: MAX_IAT_WAIT_MS,
      }),
    ).toBeNull();
  });

  it("バックオフのみの再試行は合計が予算に収まる", () => {
    let elapsedWaitMs = 0;
    JWT_IAT_RETRY_DELAYS_MS.forEach((_, attemptIndex) => {
      const delay = delayMsForJwtIssuedAtFuture({
        attemptIndex,
        iatSec: null,
        nowMs: 0,
        elapsedWaitMs,
      });
      expect(delay).toBe(JWT_IAT_RETRY_DELAYS_MS[attemptIndex]);
      elapsedWaitMs += delay!;
    });
    expect(elapsedWaitMs).toBeLessThanOrEqual(MAX_IAT_WAIT_MS);
  });
});

describe("createPostgrestFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PGRST303 のとき同一リクエストを再送し、成功したらそのレスポンスを返す", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pgrst303())
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1 }]));
    const sleep = vi.fn(async () => undefined);
    const wrapped = createPostgrestFetch({
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      now: () => 1_700_000_000_000,
    });

    const init = {
      headers: { Authorization: `Bearer ${fakeToken({ iat: 1_700_000_000 })}` },
    };
    const response = await wrapped(
      "https://example.supabase.co/rest/v1/select_options",
      init,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toBe(init);
    expect(fetchMock.mock.calls[1]?.[1]).toBe(init);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("PGRST303 以外の 401 は再試行しない", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { code: "PGRST301", message: "JWT expired" }),
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

  it("Auth エンドポイントは PGRST303 でも再試行しない", async () => {
    const fetchMock = vi.fn().mockResolvedValue(pgrst303());
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

  it("時計ずれが大きすぎるときは待たずに 401 を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(pgrst303());
    const sleep = vi.fn(async () => undefined);
    const wrapped = createPostgrestFetch({
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      now: () => 1_700_000_000_000,
    });

    // iat が 30 秒先。4 秒の予算では追い越せないため再試行しない。
    const response = await wrapped(
      "https://example.supabase.co/rest/v1/select_options",
      {
        headers: {
          Authorization: `Bearer ${fakeToken({ iat: 1_700_000_030 })}`,
        },
      },
    );

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("上限まで失敗したら最後の 401 を返す（トークンを refresh しない）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(pgrst303());
    const sleep = vi.fn(async () => undefined);
    const wrapped = createPostgrestFetch({
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      now: () => 0,
    });

    const response = await wrapped(
      "https://example.supabase.co/rest/v1/select_options",
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "PGRST303" });
    expect(fetchMock).toHaveBeenCalledTimes(JWT_IAT_RETRY_DELAYS_MS.length + 1);
    expect(sleep).toHaveBeenCalledTimes(JWT_IAT_RETRY_DELAYS_MS.length);
  });
});
