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
-- p_updates: 更新する行の配列（id と更新後の class / team / slack_id）。
-- 画面を経由しない呼び出し（PostgREST への直接の RPC・細工した Server Action の入力）でも
-- 意図しない上書きをしないよう、次のいずれかに当たる入力は INVALID_INPUT（SQLSTATE 22023）で
-- 全体を拒否する（何も更新しない）:
--   - 配列でない / 要素がオブジェクトでない
--   - 必須キー（id / class / team / slack_id）が欠けている（欠けたキーを NULL で上書きしない）
--   - id が 1 以上の bigint の範囲の整数でない（null・0・小数・範囲外を含む）/ 同じ id が複数ある
--     （どの値が勝つか不定にしない）
--   - class が許可値（public / teamleader / accounting / admin）の文字列でない
--   - team / slack_id が文字列でも null でもない
-- teamleader のチーム必須などの業務上の入力チェックは呼び出し側（app/utils/userList.ts の
-- validateUserUpdates）で行う。
CREATE OR REPLACE FUNCTION public.update_profiles(p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_expected integer;
  v_total integer;
BEGIN
  IF p_updates IS NULL THEN
    RETURN;
  END IF;
  IF jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_updates) = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_updates) AS e(elem)
    WHERE jsonb_typeof(e.elem) <> 'object'
      OR NOT (e.elem ?& ARRAY['id', 'class', 'team', 'slack_id'])
      OR jsonb_typeof(e.elem -> 'id') <> 'number'
      -- 1 以上の整数で bigint の範囲内（19 桁は上限と文字列で比較する）
      OR (e.elem ->> 'id') !~ '^[1-9][0-9]{0,18}$'
      OR (
        length(e.elem ->> 'id') = 19
        AND (e.elem ->> 'id') COLLATE "C" > '9223372036854775807'
      )
      OR jsonb_typeof(e.elem -> 'class') <> 'string'
      OR (e.elem ->> 'class') NOT IN ('public', 'teamleader', 'accounting', 'admin')
      OR jsonb_typeof(e.elem -> 'team') NOT IN ('string', 'null')
      OR jsonb_typeof(e.elem -> 'slack_id') NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(DISTINCT u.id) INTO v_total, v_expected
  FROM jsonb_to_recordset(p_updates) AS u(id bigint);
  IF v_total <> v_expected THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

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
  '管理画面のユーザーリストの一括保存（class / team / slack_id）を単一トランザクションで行う。SECURITY INVOKER で profiles の RLS（他人の行の更新は admin のみ）をそのまま適用し、RLS で弾かれた・存在しない行があって更新が指定件数に満たなければ NOT_APPLIED、キーの欠落・id の重複や null・許可値以外の class 等の不正な入力は INVALID_INPUT（22023）で全体をロールバックする。詳細: docs/database.md 5.1';

-- Supabase の既定の権限（public スキーマの関数は anon にも EXECUTE が付く）を外し、
-- ログインユーザーだけが呼べるようにする（更新の可否は RLS が判定する）
REVOKE EXECUTE ON FUNCTION public.update_profiles(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_profiles(jsonb) TO authenticated;
