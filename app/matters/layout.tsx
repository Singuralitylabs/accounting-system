import { ReactNode } from "react";
import MattersTabs from "../components/matterList/MattersTabs";
import { getCachedProfileInfo } from "../utils/supabase/requestCache";
import { hasClassAccess, ROUTE_PERMISSIONS } from "../utils/permissions";

// /matters・/matters/team・/matters/accounting で共有するタブシェル。
// タブの表示可否は ROUTE_PERMISSIONS（middleware のロール保護と同じ定義）で判定する。
const MattersLayout = async ({ children }: { children: ReactNode }) => {
  const { profileInfo, error } = await getCachedProfileInfo();
  const profileClass = error ? null : profileInfo?.class;

  const tabs = [
    { href: "/matters", label: "自分の案件" },
    ...(hasClassAccess(ROUTE_PERMISSIONS["/matters/team"], profileClass)
      ? [{ href: "/matters/team", label: "チーム案件" }]
      : []),
    ...(hasClassAccess(ROUTE_PERMISSIONS["/matters/accounting"], profileClass)
      ? [{ href: "/matters/accounting", label: "経理用一覧" }]
      : []),
  ];

  return (
    <div>
      <MattersTabs tabs={tabs} />
      {children}
    </div>
  );
};

export default MattersLayout;
