import { describe, expect, it } from "vitest";
import {
  SLACK_TEMPLATE_MAX_LENGTH,
  expandSlackTemplate,
  usesSlackPlaceholder,
  validateSlackTemplate,
} from "@/app/utils/slackTemplate";
import {
  DEFAULT_MATTER_NOTICE_SETTINGS,
  buildMatterNoticeText,
  validateMatterNoticeSettings,
} from "@/app/utils/slackNotificationTemplate";

describe("expandSlackTemplate", () => {
  it("既知のプレースホルダを展開する（同じキーが複数回あっても全て置換）", () => {
    expect(expandSlackTemplate("{a}と{b}と{a}", { a: "X", b: "Y" })).toBe(
      "XとYとX",
    );
  });

  it("日本語・記号・空の波括弧は通常の文字として扱い、展開も検証も対象外", () => {
    expect(expandSlackTemplate('【重要】{至急} {} {"a": 1}', { a: "X" })).toBe(
      '【重要】{至急} {} {"a": 1}',
    );
    expect(
      validateSlackTemplate('【重要】{至急} JSON: {"a": 1} {message}', {
        label: "本文",
        allowed: ["message"],
        required: ["message"],
      }),
    ).toBeNull();
  });

  it("大文字・アンダースコア・数字入りの識別子は未知のプレースホルダとして検証で弾く", () => {
    const rules = {
      label: "本文",
      allowed: ["message"],
      required: ["message"],
    };
    for (const typo of ["{Message}", "{matter_name}", "{a1}"]) {
      expect(validateSlackTemplate(`{message}${typo}`, rules)).toContain(typo);
    }
  });

  it("未知のプレースホルダはそのまま残す", () => {
    expect(expandSlackTemplate("{a}{zzz}", { a: "X" })).toBe("X{zzz}");
  });

  it("値に含まれる波括弧は再展開しない", () => {
    expect(expandSlackTemplate("{a}", { a: "{b}", b: "NG" })).toBe("{b}");
  });

  it("Object のプロトタイプ名（constructor 等）は展開対象にしない", () => {
    expect(expandSlackTemplate("{constructor}", {})).toBe("{constructor}");
  });
});

describe("validateSlackTemplate", () => {
  const rules = {
    label: "本文",
    allowed: ["a", "message"],
    required: ["message"],
  };

  it("許可されたプレースホルダと必須を満たせば null", () => {
    expect(validateSlackTemplate("{a} {message}", rules)).toBeNull();
  });

  it("空文字・空白のみはエラー", () => {
    expect(validateSlackTemplate("", rules)).toContain("入力してください");
    expect(validateSlackTemplate("  \n ", rules)).toContain("入力してください");
  });

  it("最大長を超えるとエラー", () => {
    const long = "{message}" + "あ".repeat(SLACK_TEMPLATE_MAX_LENGTH);
    expect(validateSlackTemplate(long, rules)).toContain("文字以内");
  });

  it("未知のプレースホルダはエラーで名前を示す", () => {
    expect(validateSlackTemplate("{message}{foo}", rules)).toContain("{foo}");
  });

  it("必須プレースホルダが無いとエラー", () => {
    expect(validateSlackTemplate("{a}", rules)).toContain("{message}");
  });
});

describe("matter notice template", () => {
  it("既定値は現行の固定文と同じ出力になる", () => {
    expect(
      buildMatterNoticeText(DEFAULT_MATTER_NOTICE_SETTINGS, {
        matter: "案件A",
        assignee: "<@U1>",
        message: "確認してください",
        sender: "経理",
        datetime: "now",
      }),
    ).toBe(
      "案件に関して、経理より通達です。\n\n案件：案件A\n担当者：<@U1>\n確認してください",
    );
  });

  it("既定値は検証を通る", () => {
    expect(
      validateMatterNoticeSettings(DEFAULT_MATTER_NOTICE_SETTINGS),
    ).toBeNull();
  });

  it("本文に {message} が無い・未知のプレースホルダ・ヘッダ空は保存不可", () => {
    expect(
      validateMatterNoticeSettings({ header: "h", bodyTemplate: "{matter}" }),
    ).not.toBeNull();
    expect(
      validateMatterNoticeSettings({
        header: "h",
        bodyTemplate: "{message}{x}",
      }),
    ).not.toBeNull();
    expect(
      validateMatterNoticeSettings({ header: " ", bodyTemplate: "{message}" }),
    ).not.toBeNull();
  });

  it("本文に {assignee} が無いと保存不可（担当者メンションが付かなくなるため）", () => {
    expect(
      validateMatterNoticeSettings({
        header: "h",
        bodyTemplate: "{matter}{message}",
      }),
    ).toContain("{assignee}");
    expect(
      validateMatterNoticeSettings({
        header: "h",
        bodyTemplate: "{Assignee}{message}",
      }),
    ).toContain("{Assignee}");
  });

  it("ヘッダにプレースホルダは使えない", () => {
    expect(
      validateMatterNoticeSettings({
        header: "{matter}",
        bodyTemplate: "{message}",
      }),
    ).not.toBeNull();
  });
});

describe("usesSlackPlaceholder", () => {
  it("テンプレートに指定のプレースホルダがあれば true", () => {
    expect(usesSlackPlaceholder("送信日時: {datetime}", "datetime")).toBe(true);
  });

  it("無い場合や、波括弧が別の文字列・大文字小文字違いの場合は false", () => {
    expect(usesSlackPlaceholder("{message}", "datetime")).toBe(false);
    expect(usesSlackPlaceholder("{Datetime} {至急}", "datetime")).toBe(false);
    expect(usesSlackPlaceholder("datetime", "datetime")).toBe(false);
  });
});
