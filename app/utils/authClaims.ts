// Reads the user_class claim from the access_token payload (set by the Custom Access Token Hook).
// Callers must have verified the token signature already (getUser()); tampering with the payload
// would fail that verification.
//
// null means the caller must fall back to a profiles query. An explicit null claim also falls
// back: the OAuth callback creates the profiles row right after token issuance, so a new user's
// first token always has user_class: null; treating that as "no class" would delay role grants
// by up to ~1 hour.
export const readClassClaim = (
  accessToken: string | undefined,
): string | null => {
  if (!accessToken) return null;
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return null;
    // base64url; atob decodes leniently, so no padding fix is needed.
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as { user_class?: unknown };
    const claim = payload.user_class;
    return typeof claim === "string" && claim.length > 0 ? claim : null;
  } catch {
    return null;
  }
};
