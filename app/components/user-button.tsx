import { auth } from "@/auth";
import { SignIn, SignOut } from "./auth-components";

const UserButton = async () => {
  const session = await auth();

  return <div>{session?.user ? <SignOut /> : <SignIn />}</div>;
};

export default UserButton;
