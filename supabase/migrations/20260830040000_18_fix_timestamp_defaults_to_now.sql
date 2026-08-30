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
--   本マイグレーションでは補正しない（列ごとに状態が異なるため。詳細は
--   docs/database.md 1.3）。
--
--   - matters.inserted_at / profiles.inserted_at
--       アプリ側が INSERT 時に new Date().toISOString() で明示指定するため
--       （app/utils/supabase/matters.ts / profiles.ts）ずれていない。補正不要。
--   - matters.updated_at / profiles.updated_at
--       INSERT のみの行はアプリ指定で正しく、UPDATE を経た行は BEFORE UPDATE
--       トリガー（アプリ指定値を上書きする）由来で +9h。両者が同一列に混在し、
--       事後に判別できないため補正不能。
--   - costs / business / recurring_costs / extra_entries の
--     inserted_at・updated_at
--       アプリ側にタイムスタンプを書く経路がなく（UPDATE 時にアプリが渡す
--       updated_at もトリガーが上書きする）、全行が DEFAULT / トリガー由来で
--       一様に +9h。理屈上は `- interval '9 hours'` で補正できる。
--   - select_option_types / select_options の created_at・updated_at
--       旧 DEFAULT が timezone('utc', ...) でセッションが UTC のためずれていない。
--
--   一様ずれの 4 テーブルを補正するなら「テーブル内の全行が移行前」と言い切れる
--   本マイグレーション内が唯一の確実な機会だが、ここでは実施しない。旧環境から
--   移送されたデータがセッション TZ = Asia/Tokyo の DB で書かれていた場合は
--   ずれておらず、一律の -9h がかえって値を壊すため（docs/database.md 1.3 の
--   「旧ローカル手適用 SQL」参照）。補正するかどうかは実データの確認後に別途判断する。

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
