import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { SignIn, SignOut } from "./auth-components";

const MobileUserButton = async () => {
  const supabase = createClientComponentClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return <div>{!session?.user ? <SignIn /> : <SignOut />}</div>;
};

export default MobileUserButton;
