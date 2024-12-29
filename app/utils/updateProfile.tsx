import { ProfilesType } from "../types/types";
import { updateUserInfo } from "./supabaseServer";

export const updateProfile = async ({ profile }: { profile: ProfilesType }) => {
  if (!profile.class || !profile.slack_id) {
    alert(`権限またはslack IDが空欄のため、ユーザーの更新を中止しました。`);
    return false;
  }

  const { error } = await updateUserInfo({ profile });
  if (error) {
    console.error("Failed to update profile:", error);
    alert("プロフィールの更新に失敗しました。");
    return false;
  }

  return true;
};

export default updateProfile;
