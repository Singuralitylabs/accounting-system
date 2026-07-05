-- Custom Access Token Hook: JWT 発行時に profiles.class を user_class クレームとして載せる。
--
-- 目的: middleware でのロール判定を、profiles テーブルへの DB クエリではなく
-- JWT クレームから直接読めるようにする（毎リクエストの DB 往復を排除）。
--
-- このフックは Supabase Auth（supabase_auth_admin ロール）がトークン発行/リフレッシュ時に
-- 呼び出す。event->>'user_id' の profiles.class を読み取り、claims に user_class を追加する。
--
-- 有効化:
--   - ローカル: supabase/config.toml の [auth.hook.custom_access_token]（本 PR で有効化済み）
--   - 本番: Supabase ダッシュボード（Authentication > Hooks）で
--     "Custom Access Token" に public.custom_access_token_hook を設定する（別途手動対応が必要）。
--
-- 反映タイミング: class を変更しても、対象ユーザーのトークンがリフレッシュ
-- （既定で最大約1時間）または再ログインするまで JWT には反映されない。
-- middleware 側は user_class クレームが無い（旧トークン/フック未設定）場合は
-- profiles への DB クエリにフォールバックするため、フェイルセーフに動作する。

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  user_class text;
BEGIN
  SELECT class INTO user_class
  FROM public.profiles
  WHERE user_id = (event->>'user_id')::uuid;

  claims := event->'claims';

  IF user_class IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_class}', to_jsonb(user_class));
  ELSE
    claims := jsonb_set(claims, '{user_class}', 'null'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- フックは supabase_auth_admin ロールから実行される。
-- 一般ロール（authenticated / anon / public）からの直接実行は禁止する。
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;

-- フック関数が profiles.class を読めるようにする。
-- profiles は RLS 有効かつ制限付き（migration 12）のため、supabase_auth_admin 向けの
-- SELECT ポリシーを明示的に追加する（このロールは内部の Auth 専用で、一般ユーザーには適用されない）。
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;

CREATE POLICY "Auth admin can read profile class for token hook"
  ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO supabase_auth_admin
  USING (true);
