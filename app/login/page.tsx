import { auth } from "@/auth";
import React from "react";
import { SignIn, SignOut } from "../components/auth-components";
import PageTitle from "../components/PageTitle";

const Login = async () => {
  const session = await auth();

  return (
    <div>
      <PageTitle title="ログイン" />
      <div className="flex justify-center items-center">
        <div className="flex justify-center h-12 items-center bg-blue-600 text-lg rounded text-white w-32 text-center my-4 hover:cursor-pointer hover:bg-blue-300">
          <div>{!session?.user ? <SignIn /> : <SignOut />}</div>
        </div>
      </div>
    </div>
  );
};

export default Login;
