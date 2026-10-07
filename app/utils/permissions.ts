// Effective roles. profiles.class holds one of PROFILE_CLASSES; "teamleader" is the profiles.is_teamleader
// flag, so a user's effective roles are class + (teamleader if flagged) — see effectiveRoles.
// When adding/renaming a role, update this, PROFILE_CLASSES, the values update_profiles accepts
// (tests/utils/permissions.test.ts checks), CLASS_DISPLAY_RANK, and ROLE_LABELS.
export const ROLES = ["public", "teamleader", "accounting", "admin"] as const;
export type Role = (typeof ROLES)[number];

// Values profiles.class can hold (a role other than the teamleader flag).
export const PROFILE_CLASSES = ["public", "accounting", "admin"] as const;
export type ProfileClass = (typeof PROFILE_CLASSES)[number];

export const isProfileClass = (
  value: string | null | undefined,
): value is ProfileClass =>
  !!value && (PROFILE_CLASSES as readonly string[]).includes(value);

// Display order in the user list (lower first). Record<ProfileClass, number> so a missing rank for a new class fails type checking.
export const CLASS_DISPLAY_RANK: Record<ProfileClass, number> = {
  admin: 0,
  accounting: 1,
  public: 2,
};

// User-facing names on the user management screen. Record<Role, string> so a missing label fails type checking.
// Stored values stay the Role keys; only the screen changes.
export const ROLE_LABELS: Record<Role, string> = {
  admin: "管理者",
  accounting: "経理",
  teamleader: "チームリーダー",
  public: "メンバー",
};

// Class select options in PROFILE_CLASSES order (not the section display order).
export const CLASS_SELECT_OPTIONS: { value: ProfileClass; label: string }[] =
  PROFILE_CLASSES.map((profileClass) => ({
    value: profileClass,
    label: ROLE_LABELS[profileClass],
  }));

// Single definition of allowed roles per route, shared by middleware, header navigation and
// Server Action permission checks.
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  // /matters itself is login-only (AUTH_ONLY_ROUTES); only sub-routes are restricted here.
  // Neither prefix-matches the other, so order does not matter.
  "/matters/team": ["teamleader", "admin"],
  "/matters/accounting": ["accounting", "admin"],
  // Old URLs redirect on the page, but role protection must still apply before the redirect.
  "/team": ["teamleader", "admin"],
  "/accounting": ["accounting", "admin"],
  "/profit-loss": ["teamleader", "accounting", "admin"],
  "/recurring-costs": ["accounting", "admin"],
  "/extra-entries": ["accounting", "admin"],
  "/budget-declarations": ["teamleader", "accounting", "admin"],
  "/dashboard": ["admin"],
};

// Always matches the /profit-loss route protection.
export const PL_ALLOWED_CLASSES = ROUTE_PERMISSIONS["/profit-loss"];

// Always matches the /matters/team route protection (team matter tab and getTeamMatterInfoList).
export const TEAM_MATTER_VIEW_CLASSES = ROUTE_PERMISSIONS["/matters/team"];

// Has no dedicated route, so defined here. Matches profit_loss_adjustments RLS (write: accounting / admin).
export const PL_ADJUSTMENT_WRITE_CLASSES: Role[] = ["accounting", "admin"];

// Matches profit_loss_labels RLS (write: accounting / admin).
export const PL_LABEL_WRITE_CLASSES: Role[] = ["accounting", "admin"];

// Closing/unclosing and applying/skipping post-closing changes. Matches profit_loss_closings /
// profit_loss_closing_lines RLS (write: accounting / admin).
export const PL_CLOSING_WRITE_CLASSES: Role[] = ["accounting", "admin"];

// Closing/reopening a month of budget declarations. Matches budget_declaration_closings RLS
// (write: accounting / admin); teamleaders may only view the closing state.
export const BUDGET_CLOSING_WRITE_CLASSES: Role[] = ["accounting", "admin"];

// Roles that may bulk-save the user list (bulkUpdateProfiles). Granting roles is privilege
// escalation, so this is separate from ROUTE_PERMISSIONS["/dashboard"]. Matches profiles UPDATE RLS
// (others' rows: admin only; migration 13) and update_profiles (migration 33). Every role that can
// write must be able to open the page (tests/utils/permissions.test.ts).
export const PROFILE_WRITE_CLASSES: Role[] = ["admin"];

// Effective role set: class (when it is a known role) plus teamleader when flagged.
export const effectiveRoles = (
  profileClass: string | null | undefined,
  isTeamleader: boolean | null | undefined,
): Role[] => {
  const roles: Role[] = [];
  if (isProfileClass(profileClass)) {
    roles.push(profileClass);
  }
  if (isTeamleader === true) roles.push("teamleader");
  return roles;
};

export const hasClassAccess = (
  allowedClasses: readonly Role[],
  profileClass: string | null | undefined,
  isTeamleader: boolean | null | undefined,
) =>
  effectiveRoles(profileClass, isTeamleader).some((role) =>
    allowedClasses.includes(role),
  );

export const matchesRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

// Login-only routes. matchesRoute("/matters", "/") is false, so "/" matches only the top page.
export const AUTH_ONLY_ROUTES = ["/", "/matters"] as const;

export const isAuthOnlyPath = (pathname: string) =>
  AUTH_ONLY_ROUTES.some((route) => matchesRoute(pathname, route));

export type NavItem = {
  href: string;
  label: string;
  description: string;
};

// Navigation for the header and top-page hub; routes absent from ROUTE_PERMISSIONS show to all
// logged-in users. No icons here: middleware imports this module and would leak React components
// into the Edge bundle (href -> icon mapping lives in the hub).
const NAV_ITEMS: NavItem[] = [
  {
    href: "/matters",
    label: "案件カード",
    description:
      "自分の案件の確認・新規作成に加え、チーム案件・経理用一覧をタブで切り替えます",
  },
  {
    href: "/profit-loss",
    label: "損益計算書",
    description:
      "月次の売上・費用・損益を確認します（経理担当者・管理者は定期費用マスタ・経理追加収支への導線あり）",
  },
  {
    href: "/budget-declarations",
    label: "事前収支申告",
    description: "翌月のチーム収支の見込みを申告・確認します",
  },
  {
    href: "/dashboard",
    label: "管理画面",
    description: "ユーザー権限とマスタデータを管理します",
  },
];

export const visibleNavItems = (
  profileClass: string | null | undefined,
  isTeamleader: boolean | null | undefined,
) =>
  NAV_ITEMS.filter((item) => {
    const allowedClasses = ROUTE_PERMISSIONS[item.href];
    return (
      !allowedClasses ||
      hasClassAccess(allowedClasses, profileClass, isTeamleader)
    );
  });
