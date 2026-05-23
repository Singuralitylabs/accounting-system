-- 重複SELECTを解消するため、Admin 用 FOR ALL を INSERT/UPDATE/DELETE 個別に分割
DROP POLICY "Admin can manage select option types" ON select_option_types;
DROP POLICY "Admin can manage select options" ON select_options;

-- select_option_types
CREATE POLICY "Admin can insert select option types" ON select_option_types
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class = 'admin'
    )
  );

CREATE POLICY "Admin can update select option types" ON select_option_types
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class = 'admin'
    )
  );

CREATE POLICY "Admin can delete select option types" ON select_option_types
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class = 'admin'
    )
  );

-- select_options
CREATE POLICY "Admin can insert select options" ON select_options
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class = 'admin'
    )
  );

CREATE POLICY "Admin can update select options" ON select_options
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class = 'admin'
    )
  );

CREATE POLICY "Admin can delete select options" ON select_options
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class = 'admin'
    )
  );
