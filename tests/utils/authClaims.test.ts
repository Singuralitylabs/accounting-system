import { describe, expect, it } from "vitest";
import { readClassClaim } from "@/app/utils/authClaims";

// テスト用: JWT ペイロードだけを base64url エンコードした「トークン」を組み立てる。
// 署名検証はテスト対象外（呼び出し側で検証済みであることを前提とした関数のため）。
const fakeToken = (payload: unknown): string =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

describe("readClassClaim", () => {
  it("accessToken が無い場合は null を返す（DB フォールバック要）", () => {
    expect(readClassClaim(undefined)).toBeNull();
  });

  it("user_class クレームが文字列の場合はその値を返す", () => {
    expect(readClassClaim(fakeToken({ user_class: "admin" }))).toBe("admin");
  });

  it("user_class クレームが明示的に null の場合も null を返す（DB フォールバック要）", () => {
    // OAuth コールバックはトークン発行後に profiles 行を作るため、新規ユーザーの
    // 初回トークンは必ず user_class: null になる。フォールバックしないと、
    // 直後のロール付与が最大約1時間反映されない。
    expect(readClassClaim(fakeToken({ user_class: null }))).toBeNull();
  });

  it("user_class クレーム自体が無い場合は null を返す（DB フォールバック要）", () => {
    expect(readClassClaim(fakeToken({ sub: "user-1" }))).toBeNull();
  });

  it("user_class が空文字の場合は null を返す（不正な値としてフォールバック）", () => {
    expect(readClassClaim(fakeToken({ user_class: "" }))).toBeNull();
  });

  it("user_class が文字列以外（数値等）の場合は null を返す", () => {
    expect(readClassClaim(fakeToken({ user_class: 42 }))).toBeNull();
  });

  it("不正な形式のトークンでは null を返す（例外を投げない）", () => {
    expect(readClassClaim("not-a-jwt")).toBeNull();
    expect(readClassClaim("only.two")).toBeNull();
    expect(readClassClaim("a.not-base64!!.c")).toBeNull();
  });
});
