-- save_budget_declaration: 事前収支申告の保存を単一トランザクション化する
--
-- Issue #103: saveBudgetDeclaration()（app/utils/supabase/budgetDeclarations.ts）は
-- ヘッダの UPDATE・既存明細の全 DELETE・新しい明細の INSERT をそれぞれ独立した
-- PostgREST 呼び出しとして実行しており、アトミックでなかった。編集保存時、
-- 既存明細を全削除した後の INSERT が失敗すると、明細が 1 件も無い状態で
-- コミット済みのまま確定してしまい、partialWriteFailed を返して再読み込みを
-- 促しても削除済みの明細は復元できず、利用者の入力内容が失われていた。
--
-- 本関数はヘッダの作成/更新・明細の全削除・明細の全登録を 1 回の関数呼び出し
-- （= 1 トランザクション）にまとめ、途中で失敗した場合は保存前の状態に完全に
-- ロールバックされるようにする。
--
-- 明示的に SECURITY INVOKER とする（既定と同じだが、RLS をバイパスしないことを
-- 意図的に示すため明記する）。migration 07 の search_path 対策と同じく
-- SET search_path = '' も付ける。budget_declarations / budget_declaration_items
-- への書き込みはいずれも呼び出し元のロールで RLS（migration 19 の
-- budget_declarations_insert_policy 等）がそのまま適用されるため、経理担当者・
-- 管理者・自チームのチームリーダー以外は書き込みポリシーで拒否される。
--
-- declared_by はクライアントから受け取らず、関数内で auth.uid() から解決する
-- （PostgREST 経由で任意の profiles.id を渡してなりすまされることを防ぐ。
-- budget_declarations_insert_policy の WITH CHECK と二重に担保する）。
CREATE OR REPLACE FUNCTION public.save_budget_declaration(
  p_declaration_id bigint,
  p_target_month date,
  p_team text,
  p_comment text,
  p_items jsonb
)
RETURNS TABLE (id bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_declaration_id bigint;
  v_declared_by bigint;
BEGIN
  SELECT p.id INTO v_declared_by FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_declared_by IS NULL THEN
    RAISE EXCEPTION 'プロフィールが見つかりません';
  END IF;

  IF p_declaration_id IS NULL THEN
    INSERT INTO public.budget_declarations (target_month, team, declared_by, comment)
    VALUES (p_target_month, p_team, v_declared_by, p_comment)
    RETURNING budget_declarations.id INTO v_declaration_id;
  ELSE
    -- team・target_month でも絞る。フォームでは両方とも編集不可（対象月は表示専用、
    -- チームは編集時に常に固定）だが、渡された id が別の申告を指していた場合に
    -- 誤って別チーム・別月の申告を書き換えないための整合性チェック
    -- （RLS がチーム単位のアクセス制御自体は担保する）
    UPDATE public.budget_declarations
    SET declared_by = v_declared_by, comment = p_comment
    WHERE budget_declarations.id = p_declaration_id
      AND budget_declarations.team = p_team
      AND budget_declarations.target_month = p_target_month
    RETURNING budget_declarations.id INTO v_declaration_id;

    -- RLS で 0 行 / 既に削除済みでもエラーにはならず単に対象行が無いだけになるため、
    -- 呼び出し側が判別できるよう固定文言で例外にする
    IF v_declaration_id IS NULL THEN
      RAISE EXCEPTION 'DECLARATION_NOT_FOUND';
    END IF;
  END IF;

  -- 明細差し替え: 既存明細を全削除してから入力内容を挿入する。新規作成では
  -- 既存明細が存在しないため 0 行 DELETE になるだけで無害（isCreate 分岐は不要）
  DELETE FROM public.budget_declaration_items
  WHERE declaration_id = v_declaration_id;

  -- p_items が空配列なら 0 行 INSERT になるだけで無害
  INSERT INTO public.budget_declaration_items
    (declaration_id, entry_type, category, description, amount, display_order)
  SELECT
    v_declaration_id,
    -- entry_type は DB の CHECK（income/expense）対象のため、前後空白付きの値の
    -- まま INSERT すると CHECK 違反で失敗する（元の saveBudgetDeclaration と同じ理由）
    btrim(item ->> 'entry_type'),
    btrim(item ->> 'category'),
    btrim(item ->> 'description'),
    (item ->> 'amount')::numeric,
    ordinality - 1
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ordinality);

  RETURN QUERY SELECT v_declaration_id;
END;
$$;

COMMENT ON FUNCTION public.save_budget_declaration(bigint, date, text, text, jsonb) IS
  '事前収支申告の作成・編集（ヘッダ + 明細差し替え）を単一トランザクションで行う。p_declaration_id が null なら新規作成、それ以外なら既存ヘッダの更新（team・target_month も一致する場合のみ）。明細は既存を全削除してから p_items（entry_type/category/description/amount を持つオブジェクトの配列）を全登録する。declared_by は auth.uid() から解決しクライアントからは受け取らない。書き込みの可否は呼び出し元ロールに対する budget_declarations / budget_declaration_items の RLS がそのまま適用される（SECURITY INVOKER）。詳細: docs/database.md, Issue #103';

REVOKE EXECUTE ON FUNCTION public.save_budget_declaration(bigint, date, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_budget_declaration(bigint, date, text, text, jsonb) TO authenticated;
