import { redirect } from "next/navigation";
import { SignIn } from "../components/auth/auth-components";
import { AuthPageShell } from "../components/auth/AuthPageShell";
import { ALLOWED_EMAIL_DOMAIN } from "../utils/constants";
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
    <AuthPageShell
      title="案件管理アプリ"
      description={`@${ALLOWED_EMAIL_DOMAIN} の Google アカウントでログインしてください。`}
    >
      <SignIn />
    </AuthPageShell>
  );
};

export default Login;
