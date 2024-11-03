import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import React from "react";
import { SignIn } from "../components/auth-components";
import PageTitle from "../components/PageTitle";

const Login = async () => {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({
    cookies: () => cookieStore,
  });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/");
  }

  return (
    <div>
      <PageTitle title="ログイン" />
      <div className="flex justify-center items-center">
        <div className="flex justify-center h-12 items-center bg-blue-600 text-lg rounded text-white w-32 text-center my-4 hover:cursor-pointer hover:bg-blue-300">
          <SignIn />
        </div>
      </div>
    </div>
  );
};

export default Login;
