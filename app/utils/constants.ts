export const ORG_WIDE_TEAM_LABEL = "全体共通";

export const teamLabel = (team: string | null): string =>
  team ?? ORG_WIDE_TEAM_LABEL;

export const teamFromLabel = (label: string | null): string | null =>
  label === ORG_WIDE_TEAM_LABEL ? null : label;

// Allowed login email domain (no @). Referenced by client and server so the restriction is layered.
export const ALLOWED_EMAIL_DOMAIN = "future-tech-association.org";

// Case/whitespace-insensitive exact match on the domain part (endsWith would accept
// "evil-future-tech-association.org").
export const isAllowedEmailDomain = (
  email: string | null | undefined,
): boolean => {
  if (!email) {
    return false;
  }
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) {
    return false;
  }
  const domain = email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
  return domain === ALLOWED_EMAIL_DOMAIN;
};
