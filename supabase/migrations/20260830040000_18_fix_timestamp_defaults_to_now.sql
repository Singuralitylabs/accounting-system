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
--   調査の結果、旧 Supabase のセッション TZ も UTC だったことが判明したため、
--   DEFAULT / トリガー由来の値は移送分・新環境分を問わず一様に +9h ずれている。
--   本マイグレーションで補正する（セクション 3）。
--
--   判定方法: matters.inserted_at はアプリが new Date().toISOString() で設定する
--   正しい絶対時刻、costs.inserted_at は DEFAULT 由来。案件登録時に両者は同時に
--   書かれるため、その差がずれの大きさになる。実データでは 20 案件中 19 案件が
--   9 時間差だった（残り 1 件は下記「補正しない列」を参照）。
--
--   補正しない列:
--   - matters.inserted_at / profiles.inserted_at
--       アプリが INSERT 時に明示指定するためずれていない。
--       ただし上記調査で差が 0 時間だった 1 案件は、この列自体が DEFAULT 由来
--       （手動投入など）で +9h ずれている可能性がある。件数が少なく機械的に
--       判別できないため、docs/database.md 1.3 の SQL で洗い出して個別に判断する。
--   - select_option_types / select_options の created_at・updated_at
--       旧 DEFAULT が timezone('utc', ...) でセッションが UTC のためずれていない。

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

-- 3. 既存行のずれ（+9h）の補正
--
--    本マイグレーション時点でテーブルにある行はすべて変更前の DEFAULT / トリガーで
--    書かれている。適用後は正しい値と混在して値だけでは判別できなくなるため、
--    ここで補正する。
--
--    注意: BEFORE UPDATE トリガー（update_*_updated_at）は NEW.updated_at を
--    now() で無条件に上書きするため、補正の UPDATE をそのまま流すと updated_at が
--    現在時刻で潰れる。matters では detect_matter_updates が has_updates を
--    立ててしまう。いずれも補正の間だけ無効化する。

-- 3-1. アプリ側にタイムスタンプを書く経路がない 4 テーブル
--      inserted_at は常に DEFAULT、updated_at は常にトリガー由来（アプリが
--      UPDATE 時に渡す updated_at もトリガーが上書きする）なので全行が対象。
ALTER TABLE public.costs           DISABLE TRIGGER update_costs_updated_at;
ALTER TABLE public.business        DISABLE TRIGGER update_business_updated_at;
ALTER TABLE public.recurring_costs DISABLE TRIGGER update_recurring_costs_updated_at;
ALTER TABLE public.extra_entries   DISABLE TRIGGER update_extra_entries_updated_at;

UPDATE public.costs
   SET inserted_at = inserted_at - interval '9 hours',
       updated_at  = updated_at  - interval '9 hours';

UPDATE public.business
   SET inserted_at = inserted_at - interval '9 hours',
       updated_at  = updated_at  - interval '9 hours';

UPDATE public.recurring_costs
   SET inserted_at = inserted_at - interval '9 hours',
       updated_at  = updated_at  - interval '9 hours';

UPDATE public.extra_entries
   SET inserted_at = inserted_at - interval '9 hours',
       updated_at  = updated_at  - interval '9 hours';

ALTER TABLE public.costs           ENABLE TRIGGER update_costs_updated_at;
ALTER TABLE public.business        ENABLE TRIGGER update_business_updated_at;
ALTER TABLE public.recurring_costs ENABLE TRIGGER update_recurring_costs_updated_at;
ALTER TABLE public.extra_entries   ENABLE TRIGGER update_extra_entries_updated_at;

-- 3-2. matters / profiles の updated_at
--      アプリは INSERT 時に inserted_at と updated_at を同じ値で設定するため、
--      両者がほぼ一致する行は「一度も UPDATE されていない = 正しい値」。
--      UPDATE を経た行は updated_at がトリガー由来で +9h ずれており、
--      inserted_at との差は必ず 9 時間以上になる。1 秒を閾値にすれば判別できる。
--      閾値未満の行を対象外にしても、ずれた値を残すことはあっても
--      正しい値を壊すことはない（安全側に倒している）。
ALTER TABLE public.matters  DISABLE TRIGGER update_matters_updated_at;
ALTER TABLE public.matters  DISABLE TRIGGER detect_matters_updates;
ALTER TABLE public.profiles DISABLE TRIGGER update_profiles_updated_at;

UPDATE public.matters
   SET updated_at = updated_at - interval '9 hours'
 WHERE updated_at > inserted_at + interval '1 second';

UPDATE public.profiles
   SET updated_at = updated_at - interval '9 hours'
 WHERE updated_at > inserted_at + interval '1 second';

ALTER TABLE public.matters  ENABLE TRIGGER update_matters_updated_at;
ALTER TABLE public.matters  ENABLE TRIGGER detect_matters_updates;
ALTER TABLE public.profiles ENABLE TRIGGER update_profiles_updated_at;
