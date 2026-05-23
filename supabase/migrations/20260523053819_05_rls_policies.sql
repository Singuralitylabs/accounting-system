-- RLS 有効化
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters             ENABLE ROW LEVEL SECURITY;
ALTER TABLE costs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE business            ENABLE ROW LEVEL SECURITY;
ALTER TABLE select_option_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE select_options      ENABLE ROW LEVEL SECURITY;

-- ===== profiles =====
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile or admin can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.class = 'admin'
    )
  );

-- ===== matters =====
CREATE POLICY "matters_select_policy" ON matters
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = matters.user_id
      AND profiles.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class IN ('admin', 'accounting')
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class = 'teamleader'
      AND profiles.team IS NOT NULL
      AND profiles.team = matters.team
    )
  );

CREATE POLICY "matters_insert_policy" ON matters
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = matters.user_id
      AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "matters_update_policy" ON matters
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = matters.user_id
      AND profiles.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class IN ('admin', 'accounting')
    )
  );

CREATE POLICY "matters_delete_policy" ON matters
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = matters.user_id
      AND profiles.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class = 'admin'
    )
  );

-- ===== costs =====
CREATE POLICY "costs_select_policy" ON costs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matters
      JOIN profiles ON profiles.id = matters.user_id
      WHERE matters.id = costs.matter_id
      AND profiles.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class IN ('admin', 'accounting')
    ) OR
    EXISTS (
      SELECT 1 FROM profiles cu, matters
      WHERE matters.id = costs.matter_id
      AND cu.user_id = auth.uid()
      AND cu.class = 'teamleader'
      AND cu.team IS NOT NULL
      AND cu.team = matters.team
    )
  );

CREATE POLICY "costs_insert_policy" ON costs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matters
      JOIN profiles ON profiles.id = matters.user_id
      WHERE matters.id = costs.matter_id
      AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "costs_update_policy" ON costs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matters
      JOIN profiles ON profiles.id = matters.user_id
      WHERE matters.id = costs.matter_id
      AND profiles.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class IN ('admin', 'accounting')
    )
  );

CREATE POLICY "costs_delete_policy" ON costs
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matters
      JOIN profiles ON profiles.id = matters.user_id
      WHERE matters.id = costs.matter_id
      AND profiles.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class = 'admin'
    )
  );

-- ===== business =====
CREATE POLICY "business_select_policy" ON business
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matters
      JOIN profiles ON profiles.id = matters.user_id
      WHERE matters.id = business.matter_id
      AND profiles.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class IN ('admin', 'accounting')
    ) OR
    EXISTS (
      SELECT 1 FROM profiles cu, matters
      WHERE matters.id = business.matter_id
      AND cu.user_id = auth.uid()
      AND cu.class = 'teamleader'
      AND cu.team IS NOT NULL
      AND cu.team = matters.team
    )
  );

CREATE POLICY "business_insert_policy" ON business
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matters
      JOIN profiles ON profiles.id = matters.user_id
      WHERE matters.id = business.matter_id
      AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "business_update_policy" ON business
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matters
      JOIN profiles ON profiles.id = matters.user_id
      WHERE matters.id = business.matter_id
      AND profiles.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class IN ('admin', 'accounting')
    )
  );

CREATE POLICY "business_delete_policy" ON business
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matters
      JOIN profiles ON profiles.id = matters.user_id
      WHERE matters.id = business.matter_id
      AND profiles.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class = 'admin'
    )
  );

-- ===== select_option_types / select_options =====
CREATE POLICY "Users can view select option types" ON select_option_types
  FOR SELECT USING (true);

CREATE POLICY "Users can view select options" ON select_options
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage select option types" ON select_option_types
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class = 'admin'
    )
  );

CREATE POLICY "Admin can manage select options" ON select_options
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.class = 'admin'
    )
  );
