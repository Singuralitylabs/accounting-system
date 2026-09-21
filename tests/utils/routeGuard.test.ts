import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthApiError,
  AuthError,
  AuthRetryableFetchError,
} from "@supabase/supabase-js";
import {
  AUTH_FETCH_TIMEOUT_MS,
  AUTH_GET_USER_TIMEOUT_MS,
  classifyPath,
  createTimeoutFetch,
  isAuthRoute,
  isPublicSkipPath,
  isTransientAuthError,
  matchesRoute,
  withAuthTimeout,
} from "@/app/utils/routeGuard";

describe("matchesRoute", () => {
  it("完全一致する", () => {
    expect(matchesRoute("/team", "/team")).toBe(true);
    expect(matchesRoute("/accounting", "/accounting")).toBe(true);
  });

  it("配下パスにマッチする", () => {
    expect(matchesRoute("/team/sub", "/team")).toBe(true);
    expect(matchesRoute("/dashboard/users", "/dashboard")).toBe(true);
  });

  it("前方一致の別パスにはマッチしない", () => {
    expect(matchesRoute("/teamX", "/team")).toBe(false);
    expect(matchesRoute("/accounting2", "/accounting")).toBe(false);
    expect(matchesRoute("/profit-loss-x", "/profit-loss")).toBe(false);
  });

  it("route が / のとき配下にはマッチしない（startsWith('//') になるため）", () => {
    expect(matchesRoute("/", "/")).toBe(true);
    expect(matchesRoute("/matters", "/")).toBe(false);
  });
});

describe("isTransientAuthError", () => {
  it("AuthRetryableFetchError は一時的障害", () => {
    expect(
      isTransientAuthError(new AuthRetryableFetchError("network", 0)),
    ).toBe(true);
  });

  it("AuthApiError の 5xx は一時的障害（500 含む）", () => {
    expect(isTransientAuthError(new AuthApiError("oops", 500, "500"))).toBe(
      true,
    );
    expect(isTransientAuthError(new AuthApiError("oops", 502, "502"))).toBe(
      true,
    );
    expect(isTransientAuthError(new AuthApiError("oops", 503, "503"))).toBe(
      true,
    );
    expect(isTransientAuthError(new AuthApiError("oops", 504, "504"))).toBe(
      true,
    );
  });

  it("401 / 403 など 5xx 以外の AuthApiError は一時的障害ではない", () => {
    expect(
      isTransientAuthError(new AuthApiError("unauthorized", 401, "401")),
    ).toBe(false);
    expect(
      isTransientAuthError(new AuthApiError("forbidden", 403, "403")),
    ).toBe(false);
  });

  it("素の AuthError は一時的障害ではない", () => {
    expect(isTransientAuthError(new AuthError("generic"))).toBe(false);
  });

  it("タイムアウト由来の AuthRetryableFetchError(status 0) は一時的障害", () => {
    expect(
      isTransientAuthError(
        new AuthRetryableFetchError(
          `Supabase Auth request timed out after ${AUTH_FETCH_TIMEOUT_MS}ms`,
          0,
        ),
      ),
    ).toBe(true);
  });

  it("withAuthTimeout の制限超過は一時的障害として拾える", async () => {
    const error = await withAuthTimeout(new Promise<never>(() => {}), 20).then(
      () => {
        throw new Error("withAuthTimeout が reject しませんでした");
      },
      (reason) => reason,
    );
    expect(error).toBeInstanceOf(AuthRetryableFetchError);
    expect(isTransientAuthError(error)).toBe(true);
  });
});

describe("createTimeoutFetch", () => {
  it("正常応答をそのまま返す", async () => {
    const seen: AbortSignal[] = [];
    const baseFetch = (async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      seen.push(init?.signal as AbortSignal);
      return new Response("ok");
    }) as typeof fetch;

    const response = await createTimeoutFetch(
      1000,
      baseFetch,
    )("https://example.test/user");
    expect(await response.text()).toBe("ok");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
  });

  it("応答しない fetch をタイムアウトで打ち切る", async () => {
    const hangingFetch = ((
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) =>
      new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(
              (init.signal as AbortSignal).reason ??
                new DOMException("Aborted", "AbortError"),
            );
          },
          { once: true },
        );
      })) as typeof fetch;

    const error = await createTimeoutFetch(
      20,
      hangingFetch,
    )("https://example.test/user").then(
      () => {
        throw new Error("タイムアウトで reject しませんでした");
      },
      (reason) => reason as Error,
    );
    expect(error.name).toBe("TimeoutError");
    expect(error.message).toContain("timed out after 20ms");
  });

  it("中断済みの signal はそのまま委譲する", async () => {
    const received: (RequestInit["signal"] | undefined)[] = [];
    const baseFetch = (async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      received.push(init?.signal);
      return new Response("ok");
    }) as typeof fetch;

    const controller = new AbortController();
    controller.abort(new Error("incoming"));
    const response = await createTimeoutFetch(1000, baseFetch)(
      "https://example.test/user",
      { signal: controller.signal },
    );
    expect(await response.text()).toBe("ok");
    expect(received[0]).toBe(controller.signal);
  });

  it("呼び出し元の signal の中断を内側に伝える", async () => {
    const incomingReason = new Error("incoming abort");
    const hangingFetch = ((
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) =>
      new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(
              (init.signal as AbortSignal).reason ??
                new DOMException("Aborted", "AbortError"),
            );
          },
          { once: true },
        );
      })) as typeof fetch;

    const controller = new AbortController();
    const pending = createTimeoutFetch(1000, hangingFetch)(
      "https://example.test/user",
      { signal: controller.signal },
    );
    controller.abort(incomingReason);
    const error = await pending.then(
      () => {
        throw new Error("中断で reject しませんでした");
      },
      (reason) => reason as Error,
    );
    expect(error).toBe(incomingReason);
  });

  it("即時失敗型（DNS 解決失敗相当）はタイマーを待たず素通りする", async () => {
    const networkError = new TypeError("fetch failed");
    const failingFetch = ((_input: Parameters<typeof fetch>[0]) =>
      Promise.reject(networkError)) as typeof fetch;

    const start = Date.now();
    const error = await createTimeoutFetch(
      5000,
      failingFetch,
    )("https://unreachable.invalid/user").then(
      () => {
        throw new Error("内側のエラーが伝わりませんでした");
      },
      (reason) => reason,
    );
    // タイムアウト（5 秒）を待たず素通りすること自体は、下の同一性で保証する。
    // wall-clock の上限アサーションは高負荷 CI で flaky になるため置かない。
    expect(Date.now() - start).toBeLessThan(5000);
    expect(error).toBe(networkError);
  });

  it("中断理由を auth-js と同じ包み方にすると一時的障害になる", async () => {
    // auth-js 2.65.1 の `_handleRequest`（`lib/fetch.js`）は fetch の reject を
    // 種類によらず `new AuthRetryableFetchError(message, 0)` に包む。この前提が
    // 崩れる（将来の更新時）と middleware の 503 経路に載らなくなるため、
    // 結合を固定化する。更新時は包み方の実コードを再確認すること。
    const hangingFetch = ((
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) =>
      new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(
              (init.signal as AbortSignal).reason ??
                new DOMException("Aborted", "AbortError"),
            );
          },
          { once: true },
        );
      })) as typeof fetch;

    const abortReason = await createTimeoutFetch(
      20,
      hangingFetch,
    )("https://example.test/user").then(
      () => {
        throw new Error("タイムアウトで reject しませんでした");
      },
      (reason) => reason as Error,
    );
    const wrapped = new AuthRetryableFetchError(abortReason.message, 0);
    expect(isTransientAuthError(wrapped)).toBe(true);
  });
});

describe("withAuthTimeout", () => {
  it("内側が速ければその値を返す", async () => {
    await expect(withAuthTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it("内側のエラーをそのまま通す", async () => {
    const original = new AuthApiError("unauthorized", 401, "401");
    const error = await withAuthTimeout(Promise.reject(original), 1000).then(
      () => {
        throw new Error("内側のエラーが伝わりませんでした");
      },
      (reason) => reason,
    );
    expect(error).toBe(original);
    expect(isTransientAuthError(error)).toBe(false);
  });

  it("既定の上限と後続取得の合算でも Edge の 25 秒制限に収まる", () => {
    // getUser 全体の上限＋後続の profiles 取得（再試行なし・1 リクエスト上限）の合算
    expect(AUTH_GET_USER_TIMEOUT_MS + AUTH_FETCH_TIMEOUT_MS).toBeLessThan(
      25000,
    );
    expect(AUTH_FETCH_TIMEOUT_MS).toBeLessThan(AUTH_GET_USER_TIMEOUT_MS);
    // 受け入れ基準「数秒以内に 503」の回帰検出（引き上げは基準との再合意が必要）
    expect(AUTH_GET_USER_TIMEOUT_MS).toBeLessThanOrEqual(6000);
  });

  it("期限切れトークンの再試行ループ想定でも全体上限で打ち切る", async () => {
    // auth-js の `_refreshAccessToken` 相当：ハングする試行＋バックオフ再試行を
    // 繰り返すループを、外側の上限で打ち切って一時的障害（＝503）に落とす。
    const hangingFetch = ((
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) =>
      new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(
              (init.signal as AbortSignal).reason ??
                new DOMException("Aborted", "AbortError"),
            );
          },
          { once: true },
        );
      })) as typeof fetch;
    const fetchWithTimeout = createTimeoutFetch(50, hangingFetch);
    const refreshLoopLike = (async () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        await fetchWithTimeout("https://unreachable.invalid/token").then(
          () => {
            throw new Error("成功しないはずの試行が解決しました");
          },
          () => {},
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        void attempt;
      }
      return "unexpectedly-settled" as const;
    })();
    const error = await withAuthTimeout(refreshLoopLike, 300).then(
      () => {
        throw new Error("全体上限で打ち切られませんでした");
      },
      (reason) => reason,
    );
    expect(error).toBeInstanceOf(AuthRetryableFetchError);
    expect(isTransientAuthError(error)).toBe(true);
  });
});

describe("タイムアウト後のタイマー残存", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("createTimeoutFetch の成功時はタイマーが残らない", async () => {
    vi.useFakeTimers();
    const baseFetch = (async () =>
      new Response("ok")) as unknown as typeof fetch;
    const pending = createTimeoutFetch(
      5000,
      baseFetch,
    )("https://example.test/user");
    // 成功パスで cleanup() が走り、保留タイマーは消える
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("withAuthTimeout の解決時はタイマーが残らない", async () => {
    vi.useFakeTimers();
    await withAuthTimeout(Promise.resolve(1), 5000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("isPublicSkipPath / isAuthRoute", () => {
  it("静的ファイル・/_next・/api・/auth/ は認証スキップ", () => {
    expect(isPublicSkipPath("/favicon.ico")).toBe(true);
    expect(isPublicSkipPath("/logo.png")).toBe(true);
    expect(isPublicSkipPath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicSkipPath("/api/health")).toBe(true);
    expect(isPublicSkipPath("/auth/callback")).toBe(true);
  });

  it("/auth-error は /auth/ ではないのでスキップ対象外", () => {
    expect(isPublicSkipPath("/auth-error")).toBe(false);
  });

  it("/login とその配下は認証画面", () => {
    expect(isAuthRoute("/login")).toBe(true);
    expect(isAuthRoute("/login/reset")).toBe(true);
    expect(isAuthRoute("/matters")).toBe(false);
  });
});

describe("classifyPath（public / protected / restricted）", () => {
  it("認証不要で通過するパス", () => {
    expect(classifyPath("/auth/callback")).toEqual({ kind: "public_skip" });
    expect(classifyPath("/auth-error")).toEqual({ kind: "open" });
  });

  it("/login 配下は保護ルートより auth_route を優先する（現行表に /login 制限は無い）", () => {
    expect(classifyPath("/login")).toEqual({ kind: "auth_route" });
    expect(classifyPath("/login/reset")).toEqual({ kind: "auth_route" });
  });

  it("ロール制限なしのログイン必須", () => {
    expect(classifyPath("/")).toEqual({ kind: "auth_only" });
    expect(classifyPath("/matters")).toEqual({ kind: "auth_only" });
    expect(classifyPath("/matters/1")).toEqual({ kind: "auth_only" });
  });

  it("/new は廃止済みのため保護対象外（未定義ルートとして open）", () => {
    expect(classifyPath("/new")).toEqual({ kind: "open" });
  });

  it("ロール制限ルートと許可ロール", () => {
    // /matters/team・/matters/accounting は /matters（AUTH_ONLY_ROUTES）の配下だが、
    // ROUTE_PERMISSIONS に一致するルートがあるため restricted が優先される
    expect(classifyPath("/matters/team")).toEqual({
      kind: "restricted",
      route: "/matters/team",
      allowed: ["teamleader", "admin"],
    });
    expect(classifyPath("/matters/accounting")).toEqual({
      kind: "restricted",
      route: "/matters/accounting",
      allowed: ["accounting", "admin"],
    });
    expect(classifyPath("/matters/team/sub")).toEqual({
      kind: "restricted",
      route: "/matters/team",
      allowed: ["teamleader", "admin"],
    });
    // 旧 URL。新 URL と同じ許可ロールで、リダイレクト前の保護として残す
    expect(classifyPath("/team")).toEqual({
      kind: "restricted",
      route: "/team",
      allowed: ["teamleader", "admin"],
    });
    expect(classifyPath("/accounting")).toEqual({
      kind: "restricted",
      route: "/accounting",
      allowed: ["accounting", "admin"],
    });
    expect(classifyPath("/profit-loss")).toEqual({
      kind: "restricted",
      route: "/profit-loss",
      allowed: ["teamleader", "accounting", "admin"],
    });
    expect(classifyPath("/recurring-costs")).toEqual({
      kind: "restricted",
      route: "/recurring-costs",
      allowed: ["accounting", "admin"],
    });
    expect(classifyPath("/extra-entries")).toEqual({
      kind: "restricted",
      route: "/extra-entries",
      allowed: ["accounting", "admin"],
    });
    expect(classifyPath("/dashboard")).toEqual({
      kind: "restricted",
      route: "/dashboard",
      allowed: ["admin"],
    });
    expect(classifyPath("/dashboard/users")).toEqual({
      kind: "restricted",
      route: "/dashboard",
      allowed: ["admin"],
    });
    expect(classifyPath("/team/sub")).toEqual({
      kind: "restricted",
      route: "/team",
      allowed: ["teamleader", "admin"],
    });
    expect(classifyPath("/teamX")).toEqual({ kind: "open" });
  });
});
