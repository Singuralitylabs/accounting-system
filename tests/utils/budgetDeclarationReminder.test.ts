import { describe, expect, it } from "vitest";
import {
  BUDGET_DECLARATION_DEADLINE_DAY,
  DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS,
  buildBudgetDeclarationReminderMessage,
  canManageBudgetDeclarationReminderSettings,
  groupSlackIdsByTeam,
  expandBudgetDeclarationReminderMessage,
  findBudgetDeclarationReminderForDay,
  validateBudgetDeclarationReminderMessage,
  isValidBudgetDeclarationReminderTargetDay,
  normalizeBudgetDeclarationReminderDays,
  undeclaredBudgetTeams,
  buildBudgetDeclarationReminderSampleAutoText,
} from "@/app/utils/budgetDeclarationReminder";

// TZ is pinned to Asia/Tokyo in vitest.config.ts (the app assumes JST).

describe("findBudgetDeclarationReminderForDay", () => {
  it.each(DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS)(
    "JST $day日は当日の行を返す",
    ({ day }) => {
      const dateString = `2026-09-${String(day).padStart(2, "0")}T03:00:00Z`; // 12:00 JST
      expect(
        findBudgetDeclarationReminderForDay(
          new Date(dateString),
          DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS,
        )?.day,
      ).toBe(day);
    },
  );

  it("日ごとに異なる文面から当日の文面を返す", () => {
    const rows = [
      { day: 15, message: "予告" },
      { day: 20, message: "本日期限" },
    ];
    expect(
      findBudgetDeclarationReminderForDay(
        new Date("2026-09-20T03:00:00Z"),
        rows,
      )?.message,
    ).toBe("本日期限");
  });

  it("対象日以外は null", () => {
    expect(
      findBudgetDeclarationReminderForDay(
        new Date("2026-09-16T03:00:00Z"),
        DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS,
      ),
    ).toBeNull();
  });

  it("UTC 深夜は JST 日付にシフトして判定する", () => {
    // 2026-09-14T15:00:00Z = 2026-09-15T00:00 JST (target day)
    expect(
      findBudgetDeclarationReminderForDay(
        new Date("2026-09-14T15:00:00Z"),
        DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS,
      )?.day,
    ).toBe(15);
  });

  it("行が空なら常に null（リマインド停止。Issue #94）", () => {
    expect(
      findBudgetDeclarationReminderForDay(new Date("2026-09-20T03:00:00Z"), []),
    ).toBeNull();
  });
});

describe("default reminder days", () => {
  it("既定は 15 / 18 / 20 日で、現行の 1 行目と同じ既定文面を持つ", () => {
    expect(DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS.map((r) => r.day)).toEqual([
      15, 18, 20,
    ]);
    expect(
      expandBudgetDeclarationReminderMessage(
        DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS[0].message,
        "2026-10",
      ),
    ).toBe(
      "【事前収支申告リマインド】2026年10月分の事前収支申告が未申告・未完了のチームがあります。",
    );
  });
});

describe("expandBudgetDeclarationReminderMessage", () => {
  it("{month} と {deadline} を展開する", () => {
    expect(
      expandBudgetDeclarationReminderMessage(
        "{month}分は{deadline}日まで",
        "2026-10",
      ),
    ).toBe(`2026年10月分は${BUDGET_DECLARATION_DEADLINE_DAY}日まで`);
  });
});

describe("validateBudgetDeclarationReminderMessage", () => {
  it("許可されたプレースホルダだけなら null", () => {
    expect(
      validateBudgetDeclarationReminderMessage("{month} {deadline}"),
    ).toBeNull();
  });

  it("未知のプレースホルダ・空はエラー", () => {
    expect(validateBudgetDeclarationReminderMessage("{foo}")).not.toBeNull();
    expect(validateBudgetDeclarationReminderMessage("")).not.toBeNull();
  });
});

describe("undeclaredBudgetTeams", () => {
  it("申告済みチームを除いた未申告チームだけを返す", () => {
    expect(
      undeclaredBudgetTeams(
        ["営業チーム", "開発チーム", "広報チーム"],
        ["開発チーム"],
      ),
    ).toEqual(["営業チーム", "広報チーム"]);
  });

  it("全チーム申告済みなら空配列", () => {
    expect(undeclaredBudgetTeams(["営業チーム"], ["営業チーム"])).toEqual([]);
  });

  it("誰も申告していなければ全チームを返す", () => {
    expect(undeclaredBudgetTeams(["営業チーム", "開発チーム"], [])).toEqual([
      "営業チーム",
      "開発チーム",
    ]);
  });
});

describe("groupSlackIdsByTeam", () => {
  it("slack_id 設定済みのリーダーだけをチームごとにまとめる", () => {
    const result = groupSlackIdsByTeam(
      ["営業チーム", "開発チーム", "広報チーム"],
      [
        { team: "営業チーム", slack_id: "U001" },
        { team: "営業チーム", slack_id: "U002" },
        { team: "開発チーム", slack_id: null },
      ],
    );

    expect(result.get("営業チーム")).toEqual(["U001", "U002"]);
    expect(result.get("開発チーム")).toEqual([]);
    expect(result.get("広報チーム")).toEqual([]);
  });
});

describe("buildBudgetDeclarationReminderMessage", () => {
  const url = "https://example.com/budget-declarations";
  const HEADER =
    "【事前収支申告リマインド】2026年10月分の事前収支申告が未申告・未完了のチームがあります。";

  it("未申告チームが 0 件なら null を返す（申告済みチームには通知しない）", () => {
    expect(buildBudgetDeclarationReminderMessage([], HEADER, url)).toBeNull();
  });

  it("slack_id 設定済みのチームはメンション付きで表示する", () => {
    const message = buildBudgetDeclarationReminderMessage(
      [{ team: "営業チーム", slackIds: ["U001"] }],
      HEADER,
      url,
    );

    expect(message).toContain("<@U001> 営業チーム");
    expect(message).toContain("2026年10月");
    expect(message).toContain(`期限: 毎月${BUDGET_DECLARATION_DEADLINE_DAY}日`);
    expect(message).toContain(url);
  });

  it("複数リーダーは全員分メンションする", () => {
    const message = buildBudgetDeclarationReminderMessage(
      [{ team: "営業チーム", slackIds: ["U001", "U002"] }],
      HEADER,
      url,
    );

    expect(message).toContain("<@U001> <@U002> 営業チーム");
  });

  it("slack_id 未設定・リーダー不在チームはメンションなしでチーム名のみ表示する", () => {
    const message = buildBudgetDeclarationReminderMessage(
      [{ team: "広報チーム", slackIds: [] }],
      HEADER,
      url,
    );

    expect(message).toContain("- 広報チーム");
    expect(message).not.toContain("<@");
  });
});

describe("buildBudgetDeclarationReminderSampleAutoText", () => {
  it("実際の投稿と同じ形式で、本文の後ろに付く部分（チーム一覧・期限・URL）だけを返す", () => {
    const header = "ヘッダ";
    const real = buildBudgetDeclarationReminderMessage(
      [
        { team: "Aチーム", slackIds: ["U01234567"] },
        { team: "Bチーム", slackIds: [] },
      ],
      header,
      "https://example.com/budget-declarations",
    );

    const auto = buildBudgetDeclarationReminderSampleAutoText();

    expect(`${header}\n${auto}`).toBe(real);
    expect(auto).toContain("期限: 毎月20日");
  });
});

describe("isValidBudgetDeclarationReminderTargetDay", () => {
  it.each([1, 15, 31])("%d は有効な対象日である", (day) => {
    expect(isValidBudgetDeclarationReminderTargetDay(day)).toBe(true);
  });

  it.each([0, 32, -1, 1.5, NaN])("%d は無効な対象日である", (day) => {
    expect(isValidBudgetDeclarationReminderTargetDay(day)).toBe(false);
  });
});

describe("normalizeBudgetDeclarationReminderDays", () => {
  const row = (day: number, message = "m") => ({ day, message });

  it("範囲外の日を除外し、同じ日は後勝ちで重複排除して昇順ソートする", () => {
    expect(
      normalizeBudgetDeclarationReminderDays([
        row(20),
        row(0),
        row(15, "a"),
        row(15, "b"),
        row(32),
        row(5),
      ]),
    ).toEqual([row(5), row(15, "b"), row(20)]);
  });

  it("空配列はそのまま空配列を返す（リマインド停止）", () => {
    expect(normalizeBudgetDeclarationReminderDays([])).toEqual([]);
  });

  it("全て無効な日なら空配列を返す", () => {
    expect(
      normalizeBudgetDeclarationReminderDays([row(0), row(32), row(-5)]),
    ).toEqual([]);
  });
});

describe("canManageBudgetDeclarationReminderSettings", () => {
  it.each(["admin", "accounting"])(
    "%s はリマインド設定を編集できる",
    (profileClass) => {
      expect(
        canManageBudgetDeclarationReminderSettings(profileClass, false),
      ).toBe(true);
    },
  );

  it.each(["teamleader", "public", null, undefined])(
    "%s はリマインド設定を編集できない",
    (profileClass) => {
      expect(
        canManageBudgetDeclarationReminderSettings(profileClass, false),
      ).toBe(false);
    },
  );
});
