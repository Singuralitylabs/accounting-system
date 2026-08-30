-- inserted_at / updated_at の保存値をセッションタイムゾーンに依存させない
--
-- 背景:
--   timezone(zone, timestamptz) の戻り値は **タイムゾーンなしの timestamp**
--   （そのゾーンの壁時計）である。これを timestamptz 列へ代入すると、
--   セッションの TimeZone のローカル時刻として再解釈される。
--   本 DB のセッション TZ は UTC（docs/database.md 1.3）なので、
--   timezone('Asia/Tokyo', now()) を代入した列には実際より約 9 時間後の
--   絶対時刻が保存されていた。
--   timezone('utc', now()) はセッションが UTC の間はたまたま正しい値になるが、
--   同じくセッション TZ に依存するため、あわせて now() に統一する。
--
-- 対応:
--   カラム DEFAULT と update_updated_at_column() トリガー関数の双方を
--   now()（timestamptz をそのまま返す）に変更する。
--
-- 既存行の扱い:
--   過去行は補正しない。matters / profiles の inserted_at・updated_at は
--   アプリ側が new Date().toISOString() で明示指定している経路があり
--   （app/utils/supabase/matters.ts / profiles.ts）、DEFAULT・トリガー由来の
--   ずれた値と正しい値が同一列に混在している。両者を事後に判別する手段がなく、
--   一律の補正はむしろ正しい値を壊すため行わない。
--   画面に表示しているのは matters.inserted_at のみで、これはアプリ側が設定する
--   正しい絶対時刻である。混在の事実は docs/database.md 1.3 に記載する。

-- 1. updated_at 自動更新トリガー関数
--    CREATE OR REPLACE は SET 句を含む関数属性も置き換えるため、
--    20260523053903_07_harden_function_search_path.sql で設定した
--    search_path = '' をここで維持する。
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 2. カラム DEFAULT
ALTER TABLE public.profiles
  ALTER COLUMN inserted_at SET DEFAULT now(),
  ALTER COLUMN updated_at  SET DEFAULT now();

ALTER TABLE public.matters
  ALTER COLUMN inserted_at SET DEFAULT now(),
  ALTER COLUMN updated_at  SET DEFAULT now();

ALTER TABLE public.costs
  ALTER COLUMN inserted_at SET DEFAULT now(),
  ALTER COLUMN updated_at  SET DEFAULT now();

ALTER TABLE public.business
  ALTER COLUMN inserted_at SET DEFAULT now(),
  ALTER COLUMN updated_at  SET DEFAULT now();

ALTER TABLE public.recurring_costs
  ALTER COLUMN inserted_at SET DEFAULT now(),
  ALTER COLUMN updated_at  SET DEFAULT now();

ALTER TABLE public.extra_entries
  ALTER COLUMN inserted_at SET DEFAULT now(),
  ALTER COLUMN updated_at  SET DEFAULT now();

-- timezone('utc', now()) だった選択肢マスタも同じ理由で now() に統一する
-- （セッションが UTC の間は値は変わらない）
ALTER TABLE public.select_option_types
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.select_options
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();
