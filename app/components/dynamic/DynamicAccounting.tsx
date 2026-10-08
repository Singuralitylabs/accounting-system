import { getAllMatterInfoList } from "@/app/utils/supabase/matters";
import type { MatterWithProfileType } from "@/app/hooks/useMatterData";
import { MatterList } from "../MatterList";

// Display-only name of the Slack channel the webhook posts to (SLACK_CHANNEL_NAME). Read on the server and
// passed as a prop, never exposed to the client as NEXT_PUBLIC_*; empty means "do not show".
export const getSlackChannelName = (): string | undefined =>
  process.env.SLACK_CHANNEL_NAME?.trim() || undefined;

const DynamicAccouting = async () => {
  const matterListWithProfile = await getAllMatterInfoList();

  // Passed in raw form (with profiles) to seed the TanStack Query cache; conversion to MatterInfoWithUserNameType happens client-side in useMemo.
  return (
    <main>
      <MatterList
        variant="accounting"
        slackChannelName={getSlackChannelName()}
        initialData={
          (matterListWithProfile as MatterWithProfileType[] | null) ?? undefined
        }
      />
    </main>
  );
};

export default DynamicAccouting;
