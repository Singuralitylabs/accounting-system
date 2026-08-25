import { ProfilesType } from "../../types/types";
import { updateUserInfo } from "./profiles";

const updateProfile = async ({ profile }: { profile: ProfilesType }) => {
  if (!profile.class) {
    throw new Error("権限が空欄のため、ユーザーの更新を中止しました。");
  }

  const { error } = await updateUserInfo({ profile });
  if (error) {
    console.error("Failed to update profile:", error);
    throw new Error("プロフィールの更新に失敗しました。");
  }

  return true;
};

export default updateProfile;
