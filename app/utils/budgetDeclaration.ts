// 事前収支申告の集計・対象月ロジック（純粋関数）。
// Supabase アクセス（"use server" が付く app/utils/supabase/budgetDeclarations.ts）から
// 切り離しているのは、副作用なしでユニットテストできるようにするため
// （docs/testing.md「2.6 テスト容易化リファクタリング方針」）。

import {
  AccessFailure,
  AccessFailureKind,
  BudgetDeclarationItemInput,
  BudgetDeclarationPreviousItem,
  BudgetDeclarationStatusType,
  BudgetSummaryType,
} from "../types/types";
import { addMonths, currentJstMonth } from "./formatter";
import { ROUTE_PERMISSIONS, Role, hasClassAccess } from "./permissions";

// addMonths は月キー（YYYY-MM）の汎用ヘルパのため app/utils/formatter.ts に定義し、
// 既存の import 元（本ファイル経由）を壊さないようここで re-export する
export { addMonths };

// 事前収支申告を閲覧できるロール（/budget-declarations のルート保護と常に一致する）
export const BUDGET_DECLARATION_ALLOWED_CLASSES =
  ROUTE_PERMISSIONS["/budget-declarations"];

// 自チームの申告だけを閲覧できるロール。閲覧可ロールのうちこれ以外は全チームを見られる
// （DB 側の判定 `public.can_access_team_budget`（migration 19 / docs/database.md 5.8）と
// 同じ区分。片方だけ変えるとアプリと RLS がずれるため、変更時は両方を直す）。
export const BUDGET_OWN_TEAM_ONLY_CLASSES: Role[] = ["teamleader"];

// 全チームの申告を閲覧できるロール。ルートの許可ロールから導出しているため、
// ROUTE_PERMISSIONS にロールを足せば一覧の表示範囲も自動で追随する。
export const BUDGET_ALL_TEAMS_CLASSES =
  BUDGET_DECLARATION_ALLOWED_CLASSES.filter(
    (role) => !BUDGET_OWN_TEAM_ONLY_CLASSES.includes(role),
  );

// 集計に必要な明細の最小形（DB 行・フォームの入力行のどちらからでも渡せる）
export type BudgetItemAmount = {
  entry_type: string;
  amount: number;
};

// 一覧の初期表示に使う対象月 = JST の翌月。
// 「毎月20日までに翌月分を申告する」運用に合わせる（docs/specification.md 4.20）。
export const defaultTargetMonth = (now: Date = new Date()): string =>
  addMonths(currentJstMonth(now), 1);

// 明細から収入合計・支出合計・差引を求める。
// 合計はヘッダに非正規化していないため、表示のたびにここで集計する
// （docs/database.md 3.9）。
export const summarizeBudgetItems = (
  items: readonly BudgetItemAmount[],
): BudgetSummaryType => {
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const item of items) {
    // amount は DB の CHECK（> 0）で正の値のみ。符号は entry_type が決める
    if (item.entry_type === "income") {
      incomeTotal += item.amount;
    } else if (item.entry_type === "expense") {
      expenseTotal += item.amount;
    }
  }

  return {
    incomeTotal,
    expenseTotal,
    balance: incomeTotal - expenseTotal,
  };
};

// 全チームの申告を閲覧できるロールか。取得側はこれを見て、チームマスタの
// 取得と全チーム分の RLS 評価が必要かを判断する。
export const canViewAllBudgetTeams = (
  profileClass: string | null | undefined,
): boolean => hasClassAccess(BUDGET_ALL_TEAMS_CLASSES, profileClass);

// 自チームのみ閲覧できるロールが見られるチーム。
// 閲覧権限がない場合とチーム未設定の場合は空配列（表示対象なし）。
export const ownBudgetTeams = (
  profileClass: string | null | undefined,
  profileTeam: string | null | undefined,
): string[] =>
  hasClassAccess(BUDGET_OWN_TEAM_ONLY_CLASSES, profileClass) && profileTeam
    ? [profileTeam]
    : [];

// 一覧に表示するチームを決める。
// 行そのものの可視範囲は RLS が担保するが、「未申告」を表示するには
// 申告が無いチームも並べる必要があるため、チームマスタ側もロールで絞る。
export const visibleBudgetTeams = (
  profileClass: string | null | undefined,
  profileTeam: string | null | undefined,
  teamList: readonly string[],
): string[] =>
  canViewAllBudgetTeams(profileClass)
    ? [...teamList]
    : ownBudgetTeams(profileClass, profileTeam);

// 対象チームへの書き込み（作成・編集・削除）が許可されるか。
// DB 側の判定 `public.can_access_team_budget`（migration 19）と同じ区分
// （canViewAllBudgetTeams / ownBudgetTeams を参照。片方だけ変えるとアプリと
// RLS がずれるため、変更時は両方を直す）。
export const canWriteBudgetTeam = (
  profileClass: string | null | undefined,
  profileTeam: string | null | undefined,
  targetTeam: string,
): boolean =>
  canViewAllBudgetTeams(profileClass) ||
  ownBudgetTeams(profileClass, profileTeam).includes(targetTeam);

// 集計前の申告（ヘッダ＋明細）。DB から取得した形に対応する
export type BudgetDeclarationWithItems = {
  id: number;
  team: string;
  updated_at: string | null;
  declared_by_name: string | null;
  items: BudgetItemAmount[];
};

// チーム一覧と申告を突き合わせ、チーム × 申告状況の行を組み立てる。
// マスタから外れた（無効化・改名された）チームの申告を取りこぼさないよう、
// チームマスタに無いチームの申告も末尾に残す。
export const buildBudgetDeclarationStatusList = (
  teams: readonly string[],
  declarations: readonly BudgetDeclarationWithItems[],
): BudgetDeclarationStatusType[] => {
  const declarationByTeam = new Map(
    declarations.map((declaration) => [declaration.team, declaration]),
  );

  const toStatus = (
    team: string,
    declaration: BudgetDeclarationWithItems | undefined,
  ): BudgetDeclarationStatusType => ({
    team,
    declarationId: declaration?.id ?? null,
    isDeclared: !!declaration,
    declaredByName: declaration?.declared_by_name ?? null,
    updatedAt: declaration?.updated_at ?? null,
    summary: summarizeBudgetItems(declaration?.items ?? []),
  });

  const rows = teams.map((team) => toStatus(team, declarationByTeam.get(team)));

  const knownTeams = new Set(teams);
  const orphanRows = declarations
    .filter((declaration) => !knownTeams.has(declaration.team))
    .map((declaration) => toStatus(declaration.team, declaration));

  return [...rows, ...orphanRows];
};

// 種別に連動した分類の選択肢を返す（収入 = category、支出 = item の既存マスタを流用）。
// 分類がマスタから外れていても（無効化・改名。前月コピー・定期明細の取り込みで
// 持ち込んだ場合を含む）選択肢に残し、見せかけ上クリアされたように見せない。
// ただしマスタの値と紛れないよう、注入した選択肢のラベルだけ「（マスタ未登録）」と
// 付記する（保存される値そのものは変えない）。BudgetDeclarationForm と
// BudgetRecurringItemList（管理セクション）で共用する
export const categoryOptionsFor = (
  entryType: string,
  category: string,
  categoryList: readonly string[],
  itemList: readonly string[],
): (string | { value: string; label: string })[] => {
  const master = entryType === "income" ? categoryList : itemList;
  if (!category || master.includes(category)) return [...master];
  return [{ value: category, label: `${category}（マスタ未登録）` }, ...master];
};

// 前月の明細を「新規行」に変換する（id・display_order を持たない。フォームの
// 明細追加ボタンで作る行と同じ形にする）。並び順は取得側
// （getPreviousBudgetDeclarationItems）が display_order 順に揃えて渡すため、
// ここでは並べ替えない（二重ソートで判定基準がずれるのを避ける）。分類が
// マスタから外れていても値はそのまま保持する（フォーム側の Select で選択肢に
// 含めるかどうかは表示側の責務であり、ここでは判定・除外しない）
export const previousItemsToFormRows = (
  items: readonly BudgetDeclarationPreviousItem[],
): BudgetDeclarationItemInput[] =>
  items.map(({ entry_type, category, description, amount, manager_id }) => ({
    entry_type,
    category,
    description,
    amount,
    manager_id,
  }));

// 一覧全体の合計（表示中のチーム分のみ）
export const totalBudgetSummary = (
  rows: readonly BudgetDeclarationStatusType[],
): BudgetSummaryType =>
  rows.reduce<BudgetSummaryType>(
    (total, row) => ({
      incomeTotal: total.incomeTotal + row.summary.incomeTotal,
      expenseTotal: total.expenseTotal + row.summary.expenseTotal,
      balance: total.balance + row.summary.balance,
    }),
    { incomeTotal: 0, expenseTotal: 0, balance: 0 },
  );

// Server Action が返した失敗（プレーンオブジェクト）を、react-query の
// queryFn から throw できる Error に変換する。kind を保持することで、
// 権限不足のときだけリトライを止め、専用のメッセージを出せる。
export class BudgetDeclarationError extends Error {
  readonly kind: AccessFailureKind;

  constructor(failure: AccessFailure) {
    super(failure.message);
    this.name = "BudgetDeclarationError";
    this.kind = failure.kind;
  }
}

// error が BudgetDeclarationError なら kind を返す（それ以外は undefined）。
// `instanceof BudgetDeclarationError` で判定しないのは、ES5 へダウンレベルする
// ツールチェーンでは組み込み Error のサブクラス判定が常に false になり、
// kind を使った出し分け（リトライ抑止・案内メッセージの切り替え）が
// 黙って効かなくなるため。`instanceof Error` と `.kind` の有無で代用する。
const getBudgetDeclarationErrorKind = (
  error: unknown,
): AccessFailureKind | undefined =>
  error instanceof Error
    ? (error as Partial<BudgetDeclarationError>).kind
    : undefined;

// 権限不足は再試行しても回復しないため、リトライ対象から外す。
export const isForbiddenError = (error: unknown): boolean =>
  getBudgetDeclarationErrorKind(error) === "forbidden";

// QueryProvider の既定は retry: 2。権限不足は再試行しても回復しないため打ち切る。
// useBudgetDeclarationData.ts / useBudgetRecurringItemData.ts の両フックが使う
// react-query の retry オプション（TQuery のエラー型を問わないよう Error を受ける）
export const retryUnlessForbidden = (failureCount: number, error: Error) =>
  !isForbiddenError(error) && failureCount < 2;

// ヘッダ保存→明細差し替えの途中で失敗し、一部のみ反映された可能性があるケースかどうか。
// ヘッダ保存自体の失敗・対象行なし・バリデーション不備・権限不足・重複エラーは
// 何も書き込まれていないため対象外（fetchFailed 全般ではなく partialWriteFailed のみを見る）
export const isPartialWriteFailureError = (error: unknown): boolean =>
  getBudgetDeclarationErrorKind(error) === "partialWriteFailed";
