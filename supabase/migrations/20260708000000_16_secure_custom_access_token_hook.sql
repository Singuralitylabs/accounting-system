-- migration 15（custom_access_token_hook）のセキュリティ・堅牢性の是正。
--
-- 背景（#26 のコードレビューで検出）:
--   1. supabase_auth_admin へテーブル全体の SELECT を付与していたため、
--      migration 12 で絞った PII 列（email / slack_id / team）が再び読めてしまう。
--      フックが実際に必要とするのは user_id / class のみのため、列単位の GRANT に絞る。
--   2. event に claims キーが無い場合、event->'claims' は SQL NULL になり
--      jsonb_set(NULL, ...) も NULL を返すため、既存の全クレームが消えてトークン
--      発行自体が失敗しうる。COALESCE でガードする。
--   3. claims キーは存在するが値が JSON null（event->'claims' が SQL NULL ではなく
--      jsonb の 'null' スカラー）の場合、上記の COALESCE では救えず
--      jsonb_set(スカラー, ...) が `cannot set path in scalar` で例外を投げる
--      （ローカル Postgres で実測確認）。claims が object 以外なら空オブジェクトに
--      リセットするガードを追加する。
--   4. event->>'user_id' が不正な形式の場合 ::uuid キャストが例外を投げるなど、
--      上記以外にも権限ドリフト等 未知の失敗要因でフックが abort しうる。
--      個別の例外コードを都度追加するのではなく、関数全体を WHEN OTHERS で
--      捕捉し、クレーム付与を諦めて event をそのまま返す（フェイルセーフ。
--      middleware は user_class が無ければ profiles への DB クエリにフォールバック
--      するため、フック自体が機能しなくてもログインは継続できる）。

-- ===== 1. 列単位の最小権限に是正 =====
REVOKE SELECT ON TABLE public.profiles FROM supabase_auth_admin;
GRANT SELECT (user_id, class) ON TABLE public.profiles TO supabase_auth_admin;

-- ===== 2. フック関数の堅牢化 =====
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

  claims := COALESCE(event->'claims', '{}'::jsonb);
  IF jsonb_typeof(claims) IS DISTINCT FROM 'object' THEN
    claims := '{}'::jsonb;
  END IF;
  claims := jsonb_set(claims, '{user_class}', COALESCE(to_jsonb(user_class), 'null'::jsonb));

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
EXCEPTION WHEN OTHERS THEN
  -- user_id が uuid として不正な形式、権限ドリフトによる SELECT 権限不足など、
  -- 想定外の要因も含めて全てここで捕捉し、クレーム付与を諦めて event をそのまま返す。
  -- トークン発行自体を失敗させない（フェイルセーフ）ことを最優先する。
  RAISE WARNING 'custom_access_token_hook failed for user_id=%: % (SQLSTATE %)',
    event->>'user_id', SQLERRM, SQLSTATE;
  RETURN event;
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'JWT 発行/リフレッシュ時に profiles.class を user_class クレームとして付与する（Custom Access Token Hook）。詳細: docs/database.md 7章';
