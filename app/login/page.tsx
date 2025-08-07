import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignIn } from "../components/auth/auth-components";
import PageTitle from "../components/PageTitle";

const Login = async () => {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({
    cookies: () => cookieStore,
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <main>
      <PageTitle title="ログイン" />
      <div className="flex justify-center items-center">
        <SignIn />
      </div>
    </main>
  );
};

export default Login;
