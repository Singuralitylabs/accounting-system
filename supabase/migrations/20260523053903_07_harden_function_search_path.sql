-- セキュリティ警告対応: トリガー関数の search_path を固定
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.detect_matter_updates()     SET search_path = '';
