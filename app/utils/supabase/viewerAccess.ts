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

export const getAuthorizedViewer = async (
  allowedClasses: readonly Role[],
  // Name used in logs and user-facing messages (e.g. "事前収支申告").
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

  if (!hasClassAccess(allowedClasses, profileInfo.class)) {
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
