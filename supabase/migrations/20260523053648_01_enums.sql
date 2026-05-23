-- information_category enum 型を作成
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'information_category') THEN
    CREATE TYPE information_category AS ENUM ('basic_info', 'business_info', 'cost_info');
  END IF;
END $$;
