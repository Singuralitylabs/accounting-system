CREATE INDEX IF NOT EXISTS idx_profiles_user_id          ON profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_matters_user_id           ON matters (user_id);
CREATE INDEX IF NOT EXISTS idx_matters_parent_matter_id  ON matters (parent_matter_id);
CREATE INDEX IF NOT EXISTS idx_costs_matter_id           ON costs (matter_id);
CREATE INDEX IF NOT EXISTS idx_business_matter_id        ON business (matter_id);
CREATE INDEX IF NOT EXISTS idx_select_options_type_id    ON select_options (type_id);
