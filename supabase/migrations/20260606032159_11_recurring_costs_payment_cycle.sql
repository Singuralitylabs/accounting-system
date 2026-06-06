-- recurring_costs: 支払サイクル（月払い/四半期払い/年払い）対応
-- 支払月は start_month を起点にサイクル間隔ごとに自動計算し、損益計算書には支払月に全額計上する。
ALTER TABLE recurring_costs
  ADD COLUMN payment_cycle text NOT NULL DEFAULT 'monthly'
  CHECK (payment_cycle IN ('monthly', 'quarterly', 'yearly'));

COMMENT ON COLUMN recurring_costs.payment_cycle IS '支払サイクル（monthly=月払い / quarterly=四半期払い / yearly=年払い）。支払月は start_month を起点にサイクル間隔ごと。損益計算書には支払月に全額計上する';
