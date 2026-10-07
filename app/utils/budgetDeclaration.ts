// Pure aggregation and target-month logic for budget declarations, separate from the
// "use server" Supabase access so it can be unit-tested.

import {
  AccessFailure,
  AccessFailureKind,
  BudgetDeclarationItemInput,
  BudgetDeclarationPreviousItem,
  BudgetDeclarationStatus,
  BudgetDeclarationStatusType,
  BudgetSummaryType,
} from "../types/types";
import { addMonths, currentJstMonth } from "./formatter";
import { ROUTE_PERMISSIONS, Role, hasClassAccess } from "./permissions";

// Re-exported so existing importers keep working (addMonths lives in formatter.ts).
export { addMonths };

// Always matches the /budget-declarations route protection.
export const BUDGET_DECLARATION_ALLOWED_CLASSES =
  ROUTE_PERMISSIONS["/budget-declarations"];

// Roles that may write only their own team's declarations. Mirrors DB `public.can_access_team_budget`
// (migration 19); change both together or the app and RLS diverge. Reading is open to every role
// that can open the page (SELECT policies, migration 38).
export const BUDGET_OWN_TEAM_ONLY_CLASSES: Role[] = ["teamleader"];

// Derived from route permissions, so adding a role there widens the list automatically.
export const BUDGET_WRITE_ALL_TEAMS_CLASSES =
  BUDGET_DECLARATION_ALLOWED_CLASSES.filter(
    (role) => !BUDGET_OWN_TEAM_ONLY_CLASSES.includes(role),
  );

export type BudgetItemAmount = {
  entry_type: string;
  amount: number;
};

// Default list month = next month in JST (declare next month's budget by the 20th).
export const defaultTargetMonth = (now: Date = new Date()): string =>
  addMonths(currentJstMonth(now), 1);

// Totals are not denormalized in the header; computed at display time.
export const summarizeBudgetItems = (
  items: readonly BudgetItemAmount[],
): BudgetSummaryType => {
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const item of items) {
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

// Write access to every team (accounting / admin); teamleaders write only their own team. A user who
// is both (e.g. accounting + teamleader flag) gets the wider all-team access.
export const canWriteAllBudgetTeams = (
  profileClass: string | null | undefined,
  isTeamleader: boolean | null | undefined,
): boolean =>
  hasClassAccess(BUDGET_WRITE_ALL_TEAMS_CLASSES, profileClass, isTeamleader);

// Empty when the role has no access or no team is set.
export const ownBudgetTeams = (
  profileClass: string | null | undefined,
  profileTeam: string | null | undefined,
  isTeamleader: boolean | null | undefined,
): string[] =>
  hasClassAccess(BUDGET_OWN_TEAM_ONLY_CLASSES, profileClass, isTeamleader) &&
  profileTeam
    ? [profileTeam]
    : [];

// Mirrors DB `public.can_access_team_budget` (migrations 19 / 41); change both together.
export const canWriteBudgetTeam = (
  profileClass: string | null | undefined,
  profileTeam: string | null | undefined,
  targetTeam: string,
  isTeamleader: boolean | null | undefined,
): boolean =>
  canWriteAllBudgetTeams(profileClass, isTeamleader) ||
  ownBudgetTeams(profileClass, profileTeam, isTeamleader).includes(targetTeam);

// Row background per entry type (for the `bg` prop, as in AccountingTablebody). The `-light`
// variables are translucent and theme-aware, so income / expense stay distinguishable in both light
// and dark color schemes.
export const budgetEntryRowBg = (entryType: string): string =>
  entryType === "expense"
    ? "var(--mantine-color-red-light)"
    : "var(--mantine-color-blue-light)";

// Expense amounts are shown in red (income keeps the default color).
export const budgetAmountColor = (entryType: string): string | undefined =>
  entryType === "expense" ? "var(--mantine-color-red-filled)" : undefined;

export const BUDGET_MONTH_CLOSED_MESSAGE =
  "この月の事前収支申告は確定済みのため、作成・編集・削除できません。";

export type BudgetDeclarationWithItems = {
  id: number;
  team: string;
  updated_at: string | null;
  completed_at: string | null;
  declared_by_name: string | null;
  items: BudgetItemAmount[];
};

// Declared only when completed_at is set; a header row alone is "in progress".
export const budgetDeclarationStatus = (
  declaration: { completed_at: string | null } | undefined,
): BudgetDeclarationStatus =>
  !declaration
    ? "notDeclared"
    : declaration.completed_at !== null
      ? "declared"
      : "inProgress";

// Declarations for teams missing from the master (disabled/renamed) are appended so none are dropped.
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
    status: budgetDeclarationStatus(declaration),
    itemCount: declaration?.items.length ?? 0,
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

// Empty string means "not entered" (required's job), distinct from "unregistered". Trims before
// matching, as saving trims (same criterion as validateBudgetDeclarationItem / the Server Action).
export const isCategoryUnregistered = (
  entryType: string,
  category: string,
  categoryList: readonly string[],
  itemList: readonly string[],
): boolean => {
  const trimmedCategory = category.trim();
  if (!trimmedCategory) return false;
  const trimmedEntryType = entryType.trim();
  if (trimmedEntryType !== "income" && trimmedEntryType !== "expense") {
    return false;
  }
  const master = trimmedEntryType === "income" ? categoryList : itemList;
  return !master.includes(trimmedCategory);
};

// Income = category, expense = item master. Values missing from the master (disabled/renamed, or
// brought in via previous-month copy / recurring import) stay selectable, labelled 「（マスタ未登録）」,
// and disabled so an invalid value cannot be re-selected after switching to a valid one.
// Shared by BudgetDeclarationForm and BudgetRecurringItemList.
export const categoryOptionsFor = (
  entryType: string,
  category: string,
  categoryList: readonly string[],
  itemList: readonly string[],
): (string | { value: string; label: string; disabled: boolean })[] => {
  const master = entryType === "income" ? categoryList : itemList;
  if (!category || master.includes(category)) return [...master];
  return [
    { value: category, label: `${category}（マスタ未登録）`, disabled: true },
    ...master,
  ];
};

// Order comes from the fetch side (display_order), so do not re-sort. Values missing from the
// master are kept; whether to offer them is the form's job.
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

// Lets react-query's queryFn throw; keeps `kind` so retries stop and a dedicated message shows
// only for permission errors.
export class BudgetDeclarationError extends Error {
  readonly kind: AccessFailureKind;

  constructor(failure: AccessFailure) {
    super(failure.message);
    this.name = "BudgetDeclarationError";
    this.kind = failure.kind;
  }
}

// Not `instanceof BudgetDeclarationError`: toolchains that down-level to ES5 make built-in Error
// subclass checks always false, silently disabling kind-based branching. Use `instanceof Error` + `.kind`.
const getBudgetDeclarationErrorKind = (
  error: unknown,
): AccessFailureKind | undefined =>
  error instanceof Error
    ? (error as Partial<BudgetDeclarationError>).kind
    : undefined;

// Permission errors do not recover on retry.
export const isForbiddenError = (error: unknown): boolean =>
  getBudgetDeclarationErrorKind(error) === "forbidden";

// QueryProvider defaults to retry: 2. Used by useBudgetDeclarationData / useBudgetRecurringItemData.
export const retryUnlessForbidden = (failureCount: number, error: Error) =>
  !isForbiddenError(error) && failureCount < 2;

// Failure midway through header save -> line replacement may leave a partial write.
// budget_recurring_items lines are written non-transactionally (parallel INSERT/UPDATE/DELETE), so
// this is still needed; saveBudgetDeclaration is a single transaction (migration 24) and never
// returns partialWriteFailed.
export const isPartialWriteFailureError = (error: unknown): boolean =>
  getBudgetDeclarationErrorKind(error) === "partialWriteFailed";

// True only when the server answered with a failure that happens before any write.
// A thrown Error without kind (Failed to fetch, timeout) may mean the writes already ran;
// treating that as "nothing was written" lets the user save new rows again and duplicate them.
export const isPreWriteFailureError = (error: unknown): boolean => {
  const kind = getBudgetDeclarationErrorKind(error);
  return kind !== undefined && kind !== "partialWriteFailed";
};
