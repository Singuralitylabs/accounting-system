import { describe, expect, it } from "vitest";
import { readRoleClaims } from "@/app/utils/authClaims";

const readClassOf = (token: string | undefined) =>
  readRoleClaims(token).userClass;
const readFlagOf = (token: string | undefined) =>
  readRoleClaims(token).isTeamleader;

// Build a "token" containing only a base64url-encoded JWT payload. Signature verification is out of scope
// (the function assumes the caller already verified it).
const fakeToken = (payload: unknown): string =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

describe("readRoleClaims の user_class", () => {
  it("accessToken が無い場合は null を返す（DB フォールバック要）", () => {
    expect(readClassOf(undefined)).toBeNull();
  });

  it("user_class クレームが文字列の場合はその値を返す", () => {
    expect(readClassOf(fakeToken({ user_class: "admin" }))).toBe("admin");
  });

  it("user_class クレームが明示的に null の場合も null を返す（DB フォールバック要）", () => {
    // The OAuth callback creates the profiles row after token issuance, so a new user's first token always
    // has user_class: null. Without the fallback, the role grant would take up to ~1h to apply.
    expect(readClassOf(fakeToken({ user_class: null }))).toBeNull();
  });

  it("user_class クレーム自体が無い場合は null を返す（DB フォールバック要）", () => {
    expect(readClassOf(fakeToken({ sub: "user-1" }))).toBeNull();
  });

  it("user_class が空文字の場合は null を返す（不正な値としてフォールバック）", () => {
    expect(readClassOf(fakeToken({ user_class: "" }))).toBeNull();
  });

  it("user_class が文字列以外（数値等）の場合は null を返す", () => {
    expect(readClassOf(fakeToken({ user_class: 42 }))).toBeNull();
  });

  it("不正な形式のトークンでは null を返す（例外を投げない）", () => {
    expect(readClassOf("not-a-jwt")).toBeNull();
    expect(readClassOf("only.two")).toBeNull();
    expect(readClassOf("a.not-base64!!.c")).toBeNull();
  });
});

describe("readRoleClaims の user_is_teamleader", () => {
  it("accessToken が無い場合は null を返す（DB フォールバック要）", () => {
    expect(readFlagOf(undefined)).toBeNull();
  });

  it("user_is_teamleader クレームが true / false の場合はその真偽値を返す", () => {
    expect(readFlagOf(fakeToken({ user_is_teamleader: true }))).toBe(true);
    expect(readFlagOf(fakeToken({ user_is_teamleader: false }))).toBe(false);
  });

  it("クレーム自体が無い場合は null を返す（移行前に発行されたトークン）", () => {
    expect(readFlagOf(fakeToken({ user_class: "admin" }))).toBeNull();
  });

  it("クレームが明示的に null の場合も null を返す（DB フォールバック要）", () => {
    expect(readFlagOf(fakeToken({ user_is_teamleader: null }))).toBeNull();
  });

  it("文字列 'true' や数値など真偽値以外は null を返す", () => {
    expect(readFlagOf(fakeToken({ user_is_teamleader: "true" }))).toBeNull();
    expect(readFlagOf(fakeToken({ user_is_teamleader: "false" }))).toBeNull();
    expect(readFlagOf(fakeToken({ user_is_teamleader: 1 }))).toBeNull();
    expect(readFlagOf(fakeToken({ user_is_teamleader: 0 }))).toBeNull();
  });

  it("不正な形式のトークンでは null を返す（例外を投げない）", () => {
    expect(readFlagOf("not-a-jwt")).toBeNull();
    expect(readFlagOf("only.two")).toBeNull();
    expect(readFlagOf("a.not-base64!!.c")).toBeNull();
  });

  it("ペイロードが JSON オブジェクトでない場合は null を返す", () => {
    expect(readFlagOf(fakeToken(null))).toBeNull();
    expect(readFlagOf(fakeToken("text"))).toBeNull();
    expect(readClassOf(fakeToken(null))).toBeNull();
  });
});

describe("readRoleClaims", () => {
  it("class とフラグのクレームを 1 回のデコードでまとめて返す", () => {
    expect(
      readRoleClaims(
        fakeToken({ user_class: "accounting", user_is_teamleader: true }),
      ),
    ).toEqual({ userClass: "accounting", isTeamleader: true });
  });

  it("どちらも無効（token なし・null・不正な型）なら null を返す", () => {
    expect(readRoleClaims(undefined)).toEqual({
      userClass: null,
      isTeamleader: null,
    });
    expect(
      readRoleClaims(fakeToken({ user_class: "", user_is_teamleader: "true" })),
    ).toEqual({ userClass: null, isTeamleader: null });
  });

  it("class だけ有効でも、もう一方は独立して null になる", () => {
    expect(readRoleClaims(fakeToken({ user_class: "admin" }))).toEqual({
      userClass: "admin",
      isTeamleader: null,
    });
  });
});

describe("readRoleClaims の旧トークン互換（migration 41 以前）", () => {
  it("user_class が 'teamleader' の旧トークンは、public + フラグ true として読む", () => {
    expect(readRoleClaims(fakeToken({ user_class: "teamleader" }))).toEqual({
      userClass: "public",
      isTeamleader: true,
    });
  });
});
