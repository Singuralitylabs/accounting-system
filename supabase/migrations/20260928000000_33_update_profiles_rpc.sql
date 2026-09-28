-- 管理画面のユーザーリストの一括保存（権限・チーム・Slack ID）を 1 トランザクションで行う RPC
--
-- 管理画面（/dashboard/users）のユーザーリストは、これまで行ごとの「保存」ボタンで
-- profiles を 1 件ずつ UPDATE していた。複数ユーザーをまとめて保存できるようにするにあたり、
-- 途中で 1 件でも保存できなければどの行も保存しない（一部だけ反映された状態を残さない）よう、
-- 本関数で 1 回の呼び出し（= 1 トランザクション）・1 文の UPDATE にまとめる。
--
-- SECURITY INVOKER（既定）にし、profiles の RLS（UPDATE で他人の行を更新できるのは admin だけ。
-- admin 以外は自分の行のみ、かつ class / team を変えない場合に限る。migration 13）をそのまま適用する。
-- RLS の USING で弾かれた UPDATE はエラーにならず 0 行になるだけのため（従来の 1 件ずつの保存でも
-- 黙って成功扱いになっていた）、更新した行数を数え、指定した件数に満たなければ NOT_APPLIED を
-- 投げて全体をロールバックする（存在しない id を指定した場合も同じ）。WITH CHECK 違反は RLS の
-- エラー（42501）になりロールバックされる。
--
-- クライアントからの upsert は使わない（profiles の INSERT ポリシー（auth.uid() = user_id）に
-- 弾かれるため）。
--
-- p_updates: 更新する行の配列（id と更新後の class / team / slack_id）。入力値の検証
-- （権限は必須・teamleader はチームが必須）は呼び出し側（app/utils/userList.ts の
-- validateUserUpdates）で行う。
CREATE OR REPLACE FUNCTION public.update_profiles(p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_expected integer;
BEGIN
  IF COALESCE(jsonb_array_length(p_updates), 0) = 0 THEN
    RETURN;
  END IF;

  SELECT count(DISTINCT u.id) INTO v_expected
  FROM jsonb_to_recordset(p_updates) AS u(id bigint);

  UPDATE public.profiles p SET
    class = u.class,
    team = u.team,
    slack_id = u.slack_id,
    updated_at = now()
  FROM jsonb_to_recordset(p_updates) AS u(
    id bigint, class text, team text, slack_id text
  )
  WHERE p.id = u.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count < v_expected THEN
    RAISE EXCEPTION 'NOT_APPLIED';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_profiles(jsonb) IS
  '管理画面のユーザーリストの一括保存（class / team / slack_id）を単一トランザクションで行う。SECURITY INVOKER で profiles の RLS（他人の行の更新は admin のみ）をそのまま適用し、RLS で弾かれた・存在しない行があって更新が指定件数に満たなければ NOT_APPLIED で全体をロールバックする。詳細: docs/database.md 5.1';

-- Supabase の既定の権限（public スキーマの関数は anon にも EXECUTE が付く）を外し、
-- ログインユーザーだけが呼べるようにする（更新の可否は RLS が判定する）
REVOKE EXECUTE ON FUNCTION public.update_profiles(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_profiles(jsonb) TO authenticated;
