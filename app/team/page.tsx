import { redirect } from "next/navigation";

// Legacy URL: redirect kept for bookmark compatibility after matter cards moved to tabs (/matters/team).
const Team = () => {
  redirect("/matters/team");
};

export default Team;
