import { describe, expect, it } from "vitest";
import {
  ALLOWED_EMAIL_DOMAIN,
  isAllowedEmailDomain,
} from "@/app/utils/constants";

describe("isAllowedEmailDomain", () => {
  it("許可ドメインのメールアドレスを許可する", () => {
    expect(isAllowedEmailDomain(`user@${ALLOWED_EMAIL_DOMAIN}`)).toBe(true);
  });

  it("大文字小文字を無視して判定する", () => {
    expect(isAllowedEmailDomain("USER@FUTURE-TECH-ASSOCIATION.ORG")).toBe(true);
  });

  it("ドメイン部の前後空白を無視して判定する", () => {
    expect(isAllowedEmailDomain("user@future-tech-association.org ")).toBe(
      true,
    );
  });

  it("許可ドメインを末尾に含むだけの別ドメインを拒否する（部分一致攻撃の防止）", () => {
    expect(isAllowedEmailDomain("user@evil-future-tech-association.org")).toBe(
      false,
    );
  });

  it("許可ドメインのサブドメインを拒否する", () => {
    expect(isAllowedEmailDomain("user@sub.future-tech-association.org")).toBe(
      false,
    );
  });

  it("別ドメインを拒否する", () => {
    expect(isAllowedEmailDomain("user@example.com")).toBe(false);
  });

  it("null / undefined / 空文字を拒否する", () => {
    expect(isAllowedEmailDomain(null)).toBe(false);
    expect(isAllowedEmailDomain(undefined)).toBe(false);
    expect(isAllowedEmailDomain("")).toBe(false);
  });

  it("@ を含まない文字列を拒否する", () => {
    expect(isAllowedEmailDomain("future-tech-association.org")).toBe(false);
  });
});
