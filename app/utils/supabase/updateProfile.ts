import { ProfilesType } from "../../types/types";
import { updateUserInfo } from "./profiles";

const updateProfile = async ({ profile }: { profile: ProfilesType }) => {
  if (!profile.class) {
    alert(`権限が空欄のため、ユーザーの更新を中止しました。`);
    return false;
  }

  const { error } = await updateUserInfo({ profile });
  if (error) {
    console.error("Failed to update profile:", error);
    alert("プロフィールの更新に失敗しました。");
    return false;
  }

  alert("ユーザー情報を保存しました。");
  return true;
};

export default updateProfile;
