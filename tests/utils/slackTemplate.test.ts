import { describe, expect, it } from "vitest";
import {
  SLACK_TEMPLATE_MAX_LENGTH,
  expandSlackTemplate,
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

  it("ヘッダにプレースホルダは使えない", () => {
    expect(
      validateMatterNoticeSettings({
        header: "{matter}",
        bodyTemplate: "{message}",
      }),
    ).not.toBeNull();
  });
});
