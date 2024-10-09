import { auth } from "@/auth";
import { SignIn } from "./auth-components";
import UserButtonMenu from "./user-buttonMenu";

const UserButton = async () => {
  const session = await auth();

  return (
    <div>
      {!session?.user ? (
        <SignIn />
      ) : (
        <UserButtonMenu
          userName={session.user.name}
          userImage={session.user.image}
        />
      )}
    </div>
  );
};

export default UserButton;
