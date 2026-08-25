import { redirect } from "next/navigation";
import { SignIn } from "../components/auth/auth-components";
import PageTitle from "../components/PageTitle";
import { createServerSupabase } from "../utils/supabase/clients";

const Login = async () => {
  const supabase = createServerSupabase();
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
