// Reads the user_class / user_is_teamleader claims from the access_token payload (set by the Custom
// Access Token Hook). Callers must have verified the token signature already (getUser()); tampering
// with the payload would fail that verification.
//
// null means the caller must fall back to a profiles query. An explicit null claim also falls
// back: the OAuth callback creates the profiles row right after token issuance, so a new user's
// first token always has user_class: null; treating that as "no class" would delay role grants
// by up to ~1 hour. The same applies to user_is_teamleader, and to tokens issued before the claim
// existed (migration 41).
const readPayload = (
  accessToken: string | undefined,
): Record<string, unknown> | null => {
  if (!accessToken) return null;
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return null;
    // base64url; atob decodes leniently, so no padding fix is needed.
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload: unknown = JSON.parse(atob(base64));
    return typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export const readClassClaim = (
  accessToken: string | undefined,
): string | null => {
  const claim = readPayload(accessToken)?.user_class;
  return typeof claim === "string" && claim.length > 0 ? claim : null;
};

// Only a real boolean is valid; anything else (missing / null / string / number) is treated as absent.
export const readTeamleaderClaim = (
  accessToken: string | undefined,
): boolean | null => {
  const claim = readPayload(accessToken)?.user_is_teamleader;
  return typeof claim === "boolean" ? claim : null;
};
