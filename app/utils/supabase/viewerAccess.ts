// 閲覧者のプロフィール取得 + ロール確認をまとめたサーバ側ヘルパ。
// middleware はページ遷移しか守らないため、Server Action 側でも権限を確認する
// （多層防御）。同じ「取得 → hasClassAccess」の組が各ドメインの取得関数に
// 散らばると、片方だけ条件を直したときに気付けないためここに集約する。
//
// "use server" を付けないのは、型・非 async のエクスポートを持てるようにするため
// （requestCache.ts と同じ理由）。サーバ専用モジュールからのみ import する。

import { AccessFailure, ProfilesType } from "../../types/types";
import { Role, hasClassAccess } from "../permissions";
import { getProfileInfo } from "./profiles";

export type ViewerAccessResult =
  | { profileInfo: ProfilesType; error?: undefined }
  | { profileInfo?: undefined; error: AccessFailure };

export const getAuthorizedViewer = async (
  allowedClasses: readonly Role[],
  // ログ・ユーザー向けメッセージに使う対象名（例: "事前収支申告"）
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
