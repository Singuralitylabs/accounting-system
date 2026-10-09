// Profile fetch + role check for the server side. middleware protects only navigation, so Server
// Actions check too (defense in depth); kept here so the pair is not scattered per domain.
// No "use server" so it can export types / non-async values (same as requestCache.ts); import from
// server-only modules only.

import { AccessFailure, ProfilesType } from "../../types/types";
import { Role, hasClassAccess } from "../permissions";
import { getProfileInfo } from "./profiles";

export type ViewerAccessResult =
  | { profileInfo: ProfilesType; error?: undefined }
  | { profileInfo?: undefined; error: AccessFailure };

// Login-only access (no role check): the profile must exist, whatever its class is, matching
// middleware AUTH_ONLY_ROUTES and RLS that only require an authenticated user.
export const getLoggedInViewer = async (
  subject: string,
): Promise<ViewerAccessResult> => {
  const { profileInfo, error } = await getProfileInfo();
  if (error || !profileInfo) {
    console.error("profiles情報の取得処理で失敗しました。", error);
    return {
      error: {
        kind: "fetchFailed",
        message: `${subject}の取得に失敗しました。`,
      },
    };
  }
  return { profileInfo };
};

export const getAuthorizedViewer = async (
  allowedClasses: readonly Role[],
  // Name used in logs and user-facing messages (e.g. "事前収支申告").
  subject: string,
): Promise<ViewerAccessResult> => {
  const { profileInfo, error } = await getLoggedInViewer(subject);
  if (error) {
    return { error };
  }
  if (!hasClassAccess(
      allowedClasses,
      profileInfo.class,
      profileInfo.is_teamleader,
    )) {
    console.error(`${subject}の閲覧権限がありません。`);
    return {
      error: {
        kind: "forbidden",
        message: `${subject}の閲覧権限がありません。`,
      },
    };
  }

  return { profileInfo };
};
