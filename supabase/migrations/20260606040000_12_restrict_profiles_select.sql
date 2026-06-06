-- profiles の SELECT を「全認証ユーザーが全件参照可能（USING true）」から
-- 必要最小限の行のみに制限する。
--
-- 背景: 旧ポリシーでは public ロールを含む全ログインユーザーが、他人の
-- email / slack_id / class / team を読めてしまう（情報漏えい）。
--
-- 制限後に参照できるのは以下のいずれかに該当する行のみ:
--   - 自分自身の行
--   - 閲覧者が accounting / admin（経理一覧・管理画面で全ユーザーを扱う）
--   - 閲覧者が teamleader で、対象が同じチームの行（チーム案件一覧の担当者名表示）
--
-- 注意（RLS 再帰回避）: profiles の SELECT ポリシー内で profiles を参照すると、
-- その参照自体に再び SELECT ポリシーが適用され無限再帰になる。これを避けるため、
-- 閲覧者自身の class / team は SECURITY DEFINER 関数（RLS をバイパス）で取得する。

-- 閲覧者自身の class を返す（RLS をバイパスして自分の 1 行のみ読む）
CREATE OR REPLACE FUNCTION public.auth_user_class()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT class FROM public.profiles WHERE user_id = (select auth.uid()) LIMIT 1
$$;

-- 閲覧者自身の team を返す（RLS をバイパスして自分の 1 行のみ読む）
CREATE OR REPLACE FUNCTION public.auth_user_team()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT team FROM public.profiles WHERE user_id = (select auth.uid()) LIMIT 1
$$;

-- 不特定多数からの直接呼び出しを避け、認証済みロールのみに実行を許可する
REVOKE EXECUTE ON FUNCTION public.auth_user_class() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_user_team() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_class() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_team() TO authenticated;

-- ===== SELECT ポリシーの差し替え =====
DROP POLICY "Users can view own profile" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.auth_user_class() IN ('admin', 'accounting')
    OR (
      public.auth_user_class() = 'teamleader'
      AND public.auth_user_team() IS NOT NULL
      AND profiles.team = public.auth_user_team()
    )
  );

-- ===== UPDATE ポリシーの再定義 =====
-- 旧定義は USING 内で profiles を直接参照していた（SELECT が USING(true) の間は
-- 機能していたが、上記の制限により再帰の懸念が生じる）。ヘルパ関数に置き換える。
DROP POLICY "Users can update own profile or admin can update any profile" ON profiles;

CREATE POLICY "Users can update own profile or admin can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.auth_user_class() = 'admin'
  );
