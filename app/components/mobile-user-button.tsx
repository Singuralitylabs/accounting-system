import { auth } from "@/auth";
import { SignIn, SignOut } from "./auth-components";

const MobileUserButton = async () => {
  const session = await auth();

  return <div>{!session?.user ? <SignIn /> : <SignOut />}</div>;
};

export default MobileUserButton;
