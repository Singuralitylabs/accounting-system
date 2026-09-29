import Header from "../Header";
import {
  getCachedProfileInfo,
  getCachedUser,
} from "@/app/utils/supabase/requestCache";
import { getActiveSelectOptionsByType } from "@/app/utils/supabase/selectOptionsCache";
import { InitialOptionsLoader } from "../providers/InitialOptionalLoader";

export default async function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    // getUser / profile fetches share the per-request cache, so overlapping with page data fetching costs one round trip.
    const { user } = await getCachedUser();

    let profile = null;
    let initialOptions = null;
    if (user) {
      // Profile and option masters are independent, so fetch in parallel.
      const [profileResult, { optionsByType, error: optionsError }] =
        await Promise.all([
          getCachedProfileInfo(),
          getActiveSelectOptionsByType([
            "team",
            "category",
            "item",
            "certificate",
          ]),
        ]);

      // Loading empty masters into optionsAtom would make team/category/item unselectable in every form without the user noticing, so throw. NOTE: AuthProvider renders from the root layout, so this reaches app/global-error.tsx (not a segment error.tsx), replacing every route with a retry error screen; judged better than rendering partially broken pages.
      if (optionsError) {
        throw optionsError;
      }

      // A profile failure only affects the header (authorization is by middleware / RLS): log and render without a profile.
      if (profileResult.error) {
        console.error(
          "プロフィール情報の取得に失敗しました。",
          profileResult.error,
        );
      }

      profile = profileResult.profileInfo ?? null;

      initialOptions = {
        teamList: optionsByType.team.map((option) => option.value),
        categoryList: optionsByType.category.map((option) => option.value),
        itemList: optionsByType.item.map((option) => option.value),
        certificateList: optionsByType.certificate.map(
          (option) => option.value,
        ),
      };
    }

    return (
      <>
        {initialOptions && (
          <InitialOptionsLoader initialOptions={initialOptions} />
        )}
        <Header initialUser={user} initialProfile={profile} />
        {children}
      </>
    );
  } catch (error) {
    // No session (e.g. after logout): render children only, no error.
    if (
      error instanceof Error &&
      error.message.includes("Auth session missing")
    ) {
      return <>{children}</>;
    }

    // Rethrow unexpected errors; reaches app/global-error.tsx via the root layout, as above.
    console.error("Unexpected error in AuthProvider:", error);
    throw error;
  }
}
