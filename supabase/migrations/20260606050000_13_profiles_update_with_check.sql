-- profiles の UPDATE ポリシーに WITH CHECK を追加し、権限昇格・所有者付け替えを防ぐ。
--
-- 背景: migration 12（およびそれ以前）の UPDATE ポリシーは USING のみで WITH CHECK が
-- 無かった。USING は「どの行を更新できるか」しか制約せず、更新後の値を制約しないため、
-- 一般ユーザーが自分の行に対し直接 class='admin' を書き込む自己昇格や、user_id の
-- 付け替え（所有者の差し替え）が可能だった。
--
-- 対応: 更新後の値を WITH CHECK で制約する。
--   - admin: 任意のユーザーの任意のカラムを更新可能（管理画面のユーザー編集用途）。
--   - admin 以外: 自分の行のみ、かつ class / team を現状維持する場合に限り更新可
--     （slack_id 等の更新は許可しつつ、class/team/user_id の改変は不可）。

DROP POLICY "Users can update own profile or admin can update any profile" ON profiles;

CREATE POLICY "Users can update own profile or admin can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.auth_user_class() = 'admin'
  )
  WITH CHECK (
    public.auth_user_class() = 'admin'
    OR (
      user_id = (select auth.uid())
      AND class IS NOT DISTINCT FROM public.auth_user_class()
      AND team  IS NOT DISTINCT FROM public.auth_user_team()
    )
  );
