# データベース設計書

PostgreSQL（Supabase）/ スキーマ `public`（補助関数は `private`）。カラム定義・制約・インデックス・ポリシーの SQL 全文は正本である `supabase/migrations/` と `app/lib/database.types.ts` を参照する。本書には、それらから読み取りにくい役割・意図・落とし穴だけを記す。

## 1. 概要

### 1.3 タイムゾーン方針

- セッションタイムゾーンは UTC（Supabase の既定）。マイグレーションは `ALTER DATABASE ... SET timezone` を含まない（hosted では失敗しうるため追加しない）。
- `inserted_at` / `updated_at` の DEFAULT と `update_updated_at_column` は `now()`（`timestamptz`）。セッション TZ に依存せず正しい絶対時刻が入る（migration 18 で是正済み）。
- **残課題**: migration 18 の判定で差が 0 時間だった 1 案件は、`matters.inserted_at` 自体が DEFAULT 由来（手動投入など）で +9h ずれている可能性がある。機械的に判別できないため補正対象から外している。次の SQL で洗い出して個別に判断すること（migration 18 のコメントがこの節を参照している）。

  ```sql
  WITH first_cost AS (
    SELECT matter_id, min(inserted_at) AS first_inserted_at FROM costs GROUP BY matter_id
  )
  SELECT m.id, m.title, m.inserted_at, m.updated_at, f.first_inserted_at
    FROM first_cost f JOIN matters m ON m.id = f.matter_id
   WHERE f.first_inserted_at < m.inserted_at + interval '1 hour';
  ```

- アドホック SQL で日付境界を切るときは `timezone('Asia/Tokyo', ...)` / `AT TIME ZONE 'Asia/Tokyo'` を明示する。`now()::date` や素の `date_trunc` は UTC 日付になり、JST 0:00〜9:00 で日付がずれる。
- Vitest は `TZ=Asia/Tokyo` 固定。アプリの日付表示は、`formatTimeToJp` / `formatDateTimeToJp` が `timeZone: "Asia/Tokyo"` を明示する（SSR とブラウザの hydration ずれを防ぐため）。`toMonthString` などの一部はローカル TZ に従う。

## 2. テーブル一覧

| テーブル名                       | 役割                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| profiles                         | ユーザー。`class`（public / accounting / admin）、チームリーダーのフラグ `is_teamleader`、`team` |
| matters                          | 案件（ライフサイクル・集計値・差し戻し検知フラグを持つ）                                         |
| costs                            | 案件の費用                                                                                       |
| business                         | 案件の売上（取引先ごと）                                                                         |
| select_option_types              | 選択肢の種類（team / category / item / certificate など）                                        |
| select_options                   | 選択肢の値                                                                                       |
| recurring_costs                  | 定期費用（管理費）マスタ                                                                         |
| extra_entries                    | 経理追加収支（案件に紐づかない収入・支出）                                                       |
| budget_declarations              | 事前収支申告のヘッダ（チーム × 対象月）                                                          |
| budget_declaration_items         | 事前収支申告の明細（見込み収入・支出）                                                           |
| budget_declaration_reminder_days | 未申告 Slack リマインドの対象日と日ごとの文面（1 日 1 行）                                       |
| slack_notification_settings      | Slack 担当者連絡の定型文設定（1 行のみ）                                                         |
| budget_recurring_items           | 事前収支申告の定期明細マスタ（新規申告作成時に明細へ展開）                                       |
| profit_loss_adjustments          | 損益調整（案件・定期費用の実績額修正の差分）                                                     |
| profit_loss_labels               | 損益計算書上の表示タイトル（案件・明細名の上書き）                                               |
| profit_loss_closings             | 月次収支確定のヘッダ（行があれば確定済みの月）                                                   |
| profit_loss_closing_lines        | 月次収支確定の明細（確定時点のスナップショット）                                                 |
| profit_loss_closing_dismissals   | 確定後の案件変更の見送り記録                                                                     |

列挙型は `information_category`（basic_info / business_info / cost_info。`select_option_types.category`）のみ。

## 3. テーブル詳細

共通事項:

- `target_month` / `start_month` / `end_month` は月初日で格納し、CHECK（`= date_trunc('month', ...)::date`）で正規化を強制する（無いと同月の別日付が別行になり UNIQUE が効かない）。
- `profiles.id` を参照する `declared_by` / `manager_id` / `adjusted_by` / `updated_by` / `closed_by` などは ON DELETE NO ACTION。担当者の退会で業務データが消えないための意図的な設計で、該当する profiles を削除するときは先に別メンバーへ付け替える（または NULL 可の列は解除する）。
- `team` は select_options の team と同じ値域の自由テキストで DB 側に値域制約は無い。チーム名を変更するときは select_options だけでなく `profiles.team` と各テーブルの `team`（budget_declarations / budget_recurring_items など）の既存行も更新する（RLS の判定キー・UNIQUE の一部のため、表記ゆれが重複ヘッダや過去分の非表示に直結する）。
- FK 列には索引を張る方針。`start_date` など集計用の列は案件数の規模的に索引を張っていない（必要になったら追加する。`matters.start_date` は 3.2 参照）。

### 3.1 profiles テーブル

ユーザー情報。`user_id` は auth.users への UNIQUE FK（削除時 CASCADE）。`class` が権限（public / accounting / admin）、`is_teamleader` がチームリーダーのフラグ（経理・管理者と兼任できる。migration 41 で `class = 'teamleader'` から移行）、`team` は `is_teamleader` が true のとき必須（アプリ側で検証）。権限判定は「有効ロール集合 = `class` ＋（`is_teamleader` なら teamleader）」。`slack_id` は通知用。

### 3.2 matters テーブル

案件。`is_fixed`（経理申請済み）/ `is_completed`（経理確認完了）/ `has_updates`（申請後更新。6.2 のトリガーが立てる）でライフサイクルと差し戻し検知を表し、`total_cost` / `cost_count` / `total_amount` / `business_count` / `unchecked_cost_count` は costs / business から集計した非正規化値（アプリが更新する）。`parent_matter_id` は自己参照（削除時 SET NULL）。

`matters.start_date` に索引を張らない理由: 損益計算書は案件開始日の範囲で取得するが、件数規模的に不要と判断している（必要になったら追加する。migration 25 のコメントがこの節を参照している）。

損益計算書では、案件の売上（business）・費用（costs）を請求日・支払い期限ではなく案件の `start_date` の月に計上する。下書き（`is_fixed` / `is_completed` がともに false / NULL）の案件は計上しない（`docs/specification.md` 4.16.2）。

### 3.3 costs テーブル

案件の費用（matter_id への FK、削除時 CASCADE）。`period` は支払い期限、`is_completed` は支払い完了。

### 3.4 business テーブル

案件の売上（取引先・請求日・振込期限・報酬額。matter_id への FK、削除時 CASCADE）。

### 3.5 select_option_types テーブル

選択肢の種類（`name`: team / category / item / certificate / extra_income_category / extra_expense_category / payment_method）。

### 3.6 select_options テーブル

選択肢の値。`(type_id, value)` が UNIQUE。`is_active` で無効化する。

### 3.7 recurring_costs テーブル

定期費用（管理費）。実レコードは月ごとに生成せず、損益計算書の集計時に、適用開始月（`start_month`）を起点に支払サイクル（`payment_cycle`: monthly / quarterly / yearly）ごとの支払月へ `price` を全額算入する。`end_month` は NULL = 継続中（当月を含む）。`team` が NULL は全体共通。金額改定は既存行の `end_month` で打ち切り、新しい行を追加する。

### 3.8 extra_entries テーブル

経理追加収支。損益計算書の集計時に `entry_date` の属する月へ算入する（収入の請求額 → 売上、収入の経費 → 案件費用、支出の経費 → 管理費。日付未入力は月未確定）。金額はマイナス可・0 不可（損益計算書上の減額調整に使う）。`team` が NULL は全体共通。

`entry_type` ごとの項目整合を CHECK（`extra_entries_type_fields_check`）で担保する。収入は請求額必須・決済方法なし、支出は経費・決済方法必須で請求書番号・請求先・請求額なし。

### 3.9 budget_declarations テーブル

事前収支申告のヘッダ。各チームのメンバーが翌月のチーム収支を申告する。`(target_month, team)` が UNIQUE（1 チーム × 1 対象月 = 1 行）。合計金額は非正規化せず明細から集計する。`declared_by` は最終更新者（表示・監査補助用。5.8 参照）。`completed_at`（NULL = 入力中、値あり = 申告済み）と `completed_by` は申告の完了状態で、ヘッダ行が存在するだけでは申告済みとしない（migration 39。既存行は移行時にすべて申告済みへ設定済み）。確定済みの月（3.10a）のヘッダは書き込めない。

### 3.10 budget_declaration_items テーブル

事前収支申告の明細（declaration_id への FK、ヘッダ削除時 CASCADE）。`amount` は正の値のみ、`manager_id` は任意（NULL 可）。

### 3.10a budget_declaration_closings テーブル

事前収支申告の月次確定。1 ヶ月 1 行（`target_month` は月初日で UNIQUE）で、行があればその月は確定済みで、全チームの申告（ヘッダ・明細）を作成・編集・削除できない。確定解除は行の削除。損益計算書の月次収支確定（3.15）とは独立で連動しない。`closed_by_name` は確定時点の氏名（profiles の RLS でチームリーダーが経理担当者の氏名を読めないため）。

### 3.11 budget_declaration_reminder_days テーブル

未申告 Slack リマインド（`app/api/cron/budget-declaration-reminder/route.ts`）の対象日（`day`、JST の日、1〜31）と、その日の文面（`message`。メッセージ 1 行目のテンプレート。プレースホルダ `{month}` `{deadline}`）を 1 日 1 行で持つ。**行を 0 件にするとリマインド停止。** Supabase ダッシュボード直編集（RLS バイパス）でも typo を防ぐため日の範囲と空文面を CHECK で検証している。migration 43 で旧 `budget_declaration_reminder_settings`（`target_days` 配列。migration 20）から移行し、旧テーブルは DROP した（既存の対象日は現行と同じ既定文面で引き継ぎ）。

- cron は service role で読む。取得失敗（DB エラー・例外）は `DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS`（15 / 18 / 20 日・既定文面）にフォールバックする（fail-open）。行を 0 件にして意図的に止めていても、取得が一時的に失敗すればデフォルトに戻る点は許容している。
- 編集は `/budget-declarations` の「リマインド設定」モーダルから admin / accounting が行う。保存は `replace_budget_declaration_reminder_days(p_rows jsonb)`（SECURITY INVOKER）で、テーブルロック（SHARE ROW EXCLUSIVE）を取って同時保存を直列化したうえで、1 トランザクションで全行を DELETE → INSERT する。同じ日の重複は主キー違反で失敗し全体がロールバックされる。呼び出し元が admin / accounting でなければ、空配列でも 42501 で拒否する（RLS だけだと DELETE が 0 行で黙って成功してしまうため）。Server Action 側でも保存前に正規化・文面検証し、`getAuthorizedViewer` で拒否する。

### 3.12 budget_recurring_items テーブル

毎月固定の見込み収入・支出のマスタ。対象月が適用期間（`start_month`〜`end_month`）内なら、新規の事前収支申告作成時に `budget_declaration_items` として展開する。展開後の明細は通常の明細と同じく個別に編集でき、本テーブルは変わらない（集計には使わない。recurring_costs との違い）。`display_order` はチーム内で 0 から採番し、展開時にその順で明細へ引き継ぐ。金額改定は recurring_costs と同様（`end_month` で打ち切り → 新規行）で、展開済みの明細は遡って変わらない。

### 3.13 profit_loss_adjustments テーブル

損益調整。損益計算書の売上・案件費用・管理費が実際の入金・支払額と異なるとき、経理・管理者が対象月ごとの実績額へ修正する。元データ（business / costs / recurring_costs）は書き換えず、対象行 × 対象月ごとの差分（`adjustment_amount` = 実績額 − 保存時点の元データ金額）だけを持ち、表示では「元データ + 調整 = 実績」とする（案件は申請・差し戻し検知の対象で、recurring_costs は全月に反映されるため、直接編集しない）。

- 対象は `business_id` / `cost_id` / `recurring_cost_id` のちょうど 1 つ（CHECK `num_nonnulls = 1`）。対象行 × 対象月は各 FK 列先頭の部分 UNIQUE インデックスで 1 件に限定する（PostgREST の upsert では推論できないため保存は関数 `save_profit_loss_adjustment` 経由）。
- `adjustment_amount` は 0 不可。実績額が元データと同額になったら行を削除する。`reason` は必須（空白のみ不可）。
- `source_amount_snapshot` は元データ変更検知にだけ使う。現在の元データ金額と異なると画面に警告し、自動追従はしない（経理が再確認して更新するか調整を削除する）。
- 対象行が別月へ移動した・下書きに戻された場合、調整は `target_month` に留まり、その月に対象行が無ければ「対象行が当月に存在しません」と警告する（`orphanedAdjustments`）。対象行が削除されると CASCADE で調整も消える。
- 案件の計上基準を案件開始日の月へ変更した際（migration 25）、旧計上月の調整を案件開始日の月へ付け替えた。付け替えできなかったものは据え置きで、上記の警告により経理が手動対応する。

### 3.14 profit_loss_labels テーブル

損益計算書上の表示タイトル。案件名・取引先名・コスト名・定期費用名の元データを書き換えず（案件画面と差し戻し検知への影響を避ける）、`/profit-loss` でのみ使う名称を対象行（`matter_id` / `business_id` / `cost_id` / `recurring_cost_id` のちょうど 1 つ）ごとに全月共通で持つ。金額・集計に影響しないため、月次確定の編集ロック・変更検知の対象外。

- 保存は `save_profit_loss_label` のみ。空欄で保存すると行を削除して元の名称に戻る。`label` は前後空白なし・200 文字以内。
- チーム・分類・品目・費目の見出しと経理追加収支は対象外。対象行の削除で CASCADE 削除される（確定済みの月は確定明細に保存した名称で表示される）。

### 3.15 profit_loss_closings テーブル

月次収支確定のヘッダ。1 ヶ月 1 行（`target_month` UNIQUE）で、行があればその月は確定済み。確定済みの月の損益計算書は 3.16 のスナップショットから表示する。確定解除は行の削除（明細・見送り記録は CASCADE）。金額は持たない。

`closed_by_name` / `refreshed_by_name` は氏名を保持する（profiles の RLS でチームリーダーが経理担当者の氏名を読めないため）。`refreshed_*` は確定後の変更を最後に反映した人・日時（3 列は全部 NULL か全部非 NULL。再確定でクリア）。

### 3.16 profit_loss_closing_lines テーブル

確定時点の案件の売上・費用、管理費、経理追加収支を 1 行ずつ保持するスナップショット（実績額・調整額・調整理由を含む）。`(closing_id, source_type, source_id)` が UNIQUE。`source_type` は business / cost / recurring_cost / extra_entry。CHECK で種別ごとに必要な列が揃っていることを担保する。

- `source_id` / `matter_id` / `matter_user_id` には FK を張らない（元の行や案件が消えても確定値を残すため）。
- JSON 1 カラムにせず正規化しているのは、チームリーダー向けの行単位 RLS（`team` / `matter_user_id`）と、確定後の変更検知（3.17）の明細単位の突き合わせ・反映のため。
- 明細の算出は TypeScript（`app/utils/profitLossLogic.ts` の `buildLiveMonthLines`）で行い、`save_profit_loss_closing`（5.14）で保存する。SQL に集計ロジックを二重実装しない。
- 名称（`matter_title` / `name`）は確定時点の値だが、表示では元の行が存在する限り最新の名称を使い、元の行が削除された場合のフォールバックにのみ使う。

### 3.17 profit_loss_closing_dismissals テーブル

確定後の案件変更（確定明細とライブ集計の差分）のうち、経理が「見送る」とした明細ごとの記録。見送った時点のライブの状態（`live_*`）を保持し、現在のライブと一致する間だけ「見送り済み」としてアラート・件数から外す。差分の算出は `app/utils/profitLossDiff.ts`（純粋関数）で行う。`source_type` は business / cost のみ。`(closing_id, source_type, source_id)` が UNIQUE（再見送りは upsert）。

見送り記録は、反映（`apply_profit_loss_closing_diffs`）・確定解除（CASCADE）・確定の取り直し（`save_profit_loss_closing`）で削除される。差分が解消した明細の記録は残るが表示には使われない。

### 3.18 slack_notification_settings テーブル

経理用一覧の「担当者に連絡」で送る Slack メッセージの定型文（ヘッダ `matter_notice_header`、本文テンプレート `matter_notice_body_template`）を持つシングルトン（`id = 1` を CHECK で固定）。本文には `{message}` と `{assignee}` が必須（CHECK）。プレースホルダの展開と検証は `app/utils/slackTemplate.ts` / `slackNotificationTemplate.ts`。

- 送信時は service role で読み、取得失敗は固定文（`DEFAULT_MATTER_NOTICE_SETTINGS`）にフォールバックする（通知を止めない）。
- 編集は `/matters/accounting` の「通知設定」モーダルから admin / accounting が行う（`id = 1` の UPDATE のみ。Server Action でも `getAuthorizedViewer` と検証を行う）。投稿先チャンネルは Webhook 固定のため持たない。

## 4. 列挙型

`information_category`（3.5 で使用）のみ。値は `supabase/migrations/20260523053648_01_enums.sql` を参照。

## 5. Row Level Security (RLS)

共通の前提:

- 判定には `(select auth.uid())` でラップした形を使う（`auth_rls_initplan` リンタ対応）。
- 閲覧者自身の `class` / `is_teamleader` / `team` は、profiles への再帰参照を避けるため `SECURITY DEFINER` のヘルパ `public.auth_user_class()` / `public.auth_user_is_teamleader()` / `public.auth_user_team()`（自分の 1 行のみ読む）で取得する。`authenticated` のみ EXECUTE 可。
- RPC（DB 関数）は `REVOKE ... FROM PUBLIC, anon` のうえ `authenticated` にだけ EXECUTE を付ける（Supabase の既定で anon にも EXECUTE が付くため）。SECURITY INVOKER の関数は RLS がそのまま適用される。
- RLS で弾かれた UPDATE / DELETE はエラーにならず 0 行になるだけ。書き込みの保存処理は更新件数を確認して失敗を返す（RPC は `NOT_APPLIED` 例外）。

### 5.0 テーブル / シーケンス権限（PostgREST の前提）

RLS は行スコープのゲートで、テーブルへの `GRANT SELECT / INSERT / UPDATE / DELETE` が無いと PostgREST は RLS 評価前に 403 を返す。現行のローカル Supabase イメージは `public` の DEFAULT PRIVILEGES が厳格で、`CREATE TABLE` だけでは `anon` / `authenticated` / `service_role` に CRUD が付かない。`20260826000000_17_grant_public_crud.sql` で標準の GRANT と DEFAULT PRIVILEGES を明示しており、`supabase db reset` 後も 403 に戻らない。関数の EXECUTE は付与しない（migration 15/16 の `custom_access_token_hook` 制限を維持）。

新規テーブルは DEFAULT PRIVILEGES の設定差で 403 に戻らないよう、マイグレーション内でも `GRANT` を明示する（例: `20260830050000_19_budget_declarations.sql`）。あわせて、未ログイン（anon）が触らないテーブルは `REVOKE ALL ... FROM anon` で権限側でも閉じる（RLS だけがゲートだと、将来 `TO anon` のポリシーを足した・RLS を外した瞬間にフル CRUD が開くため）。

例外として `select_options` は Supabase keep-alive（`docs/setup.md`）が anon key で SELECT するため anon の SELECT を維持する（5.5）。

### 5.1 profiles テーブル

- SELECT: 自分 / 経理・管理者（全員）/ 同チームのチームリーダー（`is_teamleader`）。以前の `USING (true)` では全ログインユーザーが他人の email・class を読めた（migration 12 で制限）。
- INSERT: 自分の行のみ（`auth.uid() = user_id`）。
- UPDATE: 自分または admin。WITH CHECK で admin 以外の `class` / `is_teamleader` / `team` / `user_id` の改変（自己昇格・所有者付け替え）を防ぐ。

#### 担当者選択肢用の関数（get_member_options / validate_member_ids）

事前収支申告の明細担当者は全メンバーから選ぶが、経理・管理者以外は上記 SELECT で自チーム（と自分）しか読めない。そこで `SECURITY DEFINER` の `get_member_options()`（`id` / `name` のみ返す）と、保存前の実在確認用 `validate_member_ids(bigint[])`（実在する id のみ返す）を用意している。PostgREST の RPC はテーブル RLS と独立に公開されるため、関数内でログイン済み（`auth.uid()` あり）に絞り、未ログイン相当は 0 行を返す（migration 44 で事前収支申告を全ユーザーに開放したため、ロールでは絞らない。anon には EXECUTE を付けない）。

#### ユーザーリストの一括更新（`update_profiles`。migration 33）

管理画面（/dashboard/users）の一括保存は `update_profiles(p_updates jsonb)` を 1 回呼ぶ（1 トランザクション。1 件でも更新できなければ全体ロールバック）。`class` / `is_teamleader` / `team` / `slack_id` / `updated_at` を更新する（migration 41 で `is_teamleader` を追加し、`class` の許可値を public / accounting / admin に変更）。

- SECURITY INVOKER。UPDATE ポリシー（他人の行は admin のみ）がそのまま適用される。RLS で弾かれた行は 0 行になるだけなので、更新件数が指定件数に満たなければ `NOT_APPLIED` で全体ロールバックする。admin 以外が class / is_teamleader / team を変えた場合は WITH CHECK 違反（42501）。
- 画面を経由しない呼び出しに備え、配列でない・必須キー（`id` / `class` / `is_teamleader` / `team` / `slack_id`）欠落・`id` が 1 以上の bigint 整数でない／重複・`class` が許可値外・`is_teamleader` が boolean でない・`team` / `slack_id` が文字列でも null でもない、のいずれかは `INVALID_INPUT`（22023）で全体拒否する。
- 業務上のチェック（`is_teamleader` のチーム必須など）はアプリ側 `validateUserUpdates`（`app/utils/userList.ts`）。呼び出しは `bulkUpdateProfiles`（`app/utils/supabase/profiles.ts`）で、Server Action として公開されるため呼び出し元の権限も `hasClassAccess(PROFILE_WRITE_CLASSES, ...)`（現状 admin のみ。`app/utils/permissions.ts`）で確認する（RLS 上は admin 以外も自分の `slack_id` は更新できるが、この経路では変更させない）。
- `class` の許可値はアプリの `PROFILE_CLASSES`（`app/utils/permissions.ts`）と一致させる。クラスを追加・改名するときは本関数の許可値も直す（`tests/utils/permissions.test.ts` が最新マイグレーションの許可値との一致を確認する）。
- クライアントからの upsert は使わない（INSERT ポリシーに弾かれる）。

### 5.2 matters テーブル

- SELECT: 自分の案件 / 経理・管理者・チームリーダー（全件。チームリーダーは損益計算書で他チームと比較するため全チームを許可する。migration 40。事前収支申告と同じく SELECT のみ広げ、書き込みは変えない）。画面上の案件一覧は `/matters`（`user_id`）・`/matters/team`（`team`）で明示的に絞る。
- INSERT: 自分の案件のみ。
- UPDATE: 自分の案件 / 経理・管理者（経理申請済みの案件も編集可。編集すると `has_updates` が立つ。6.2）。
- DELETE: 自分の案件 / admin。

### 5.3 costs テーブル / 5.4 business テーブル

案件（matter_id）経由で 5.2 と同じ権限構造。SELECT は自分の案件・経理・管理者・チームリーダー（全チーム。migration 40）、INSERT は自分の案件のみ、UPDATE は自分の案件・経理・管理者、DELETE は自分の案件・admin。

### 5.5 select_option_types テーブル・select_options テーブル

- SELECT は `TO` 句なしの `USING (true)` で anon 含む全ロールが可。keep-alive（`docs/setup.md`）が anon で読むため、migration 17 で付与した anon の SELECT を REVOKE しない（すると keep-alive が非 2xx で fail する）。
- INSERT / UPDATE / DELETE は admin のみ。`FOR ALL` にすると SELECT が参照用ポリシーと重複して `multiple_permissive_policies` リンタが発火するため、コマンドごとに定義する。
- 項目管理の保存（`bulkUpsertSelectOptions`）は UPDATE に `.select("id")` を付け、更新 0 行なら失敗として返す。

### 5.6 recurring_costs テーブル

書き込みは経理・管理者のみ。SELECT は経理・管理者・チームリーダーが全行（チームリーダーは損益計算書で他チームと比較・全体把握するため。migration 40）。

### 5.7 extra_entries テーブル

recurring_costs と同じ方針（書き込みは経理・管理者のみ。SELECT は経理・管理者・チームリーダーが全行。migration 40）。

確定済みの月の編集ロック（Issue #148、migration 27）: INSERT / UPDATE / DELETE のポリシーに `NOT private.is_pl_month_closed(entry_date)` が入る（UPDATE は変更前の月が USING、変更後の月が WITH CHECK）。詳細は 5.14。

#### 一括保存（`save_extra_entries`。migration 30）

`/extra-entries` の一括保存は `save_extra_entries(p_inserts, p_updates, p_delete_ids)` を 1 回呼ぶ（削除 → 更新 → 追加の順、1 トランザクション）。SECURITY INVOKER で上記 RLS が適用され、更新・削除が指定件数に満たなければ `NOT_APPLIED` で全体ロールバック、確定済みの月への追加・日付変更は 42501 でロールバックされる。呼び出し側（`bulkUpsertExtraEntry`）は書き込み前に確定済みの月・削除済みの行を確認して分かりやすいエラーを返し、編集していない行は UPDATE しない（確定済みの月の行に触れず他の月だけ保存できる）。

#### 前月コピー（`copy_extra_entries`。migration 35・37）

「前月の経理追加収支をコピー」は `copy_extra_entries(p_target_month date, p_rows jsonb)` を 1 回呼ぶ（1 トランザクション）。アプリ側で「既存行の確認」と「INSERT」を別リクエストにすると、2 人が同時にコピーして二重登録し得たため、対象月の排他 advisory lock を取ってから既存行を確認して INSERT する。

- ロックは `private.lock_extra_entries_copy`（`pg_advisory_xact_lock(140, YYYYMM)`、SECURITY DEFINER）。別の月は互いに待たない。advisory lock の第 1 キー: `140` = 前月コピー、`148` = 月次確定と書き込みの直列化（`private.lock_pl_month`、6.4）。別用途では異なる値にする。
- デッドロックしない: コピーは 140 → 148（共有）の順に取る。確定・一括保存は 140 を取らないため循環しない。
- ロック取得後の確認が先のコピーのコミットを見られるのは、READ COMMITTED の VOLATILE plpgsql 関数が文ごとに新しいスナップショットを取るため（ロック取得と確認付き INSERT を別の文にしている）。PostgREST が READ COMMITTED（既定）であることを前提にする。
- 同一内容の判定: entry_type・分類・内容・責任者・チーム・請求額・経費がすべて一致する当月の行があればスキップ。比較はすべて `IS NOT DISTINCT FROM`（NULL 同士も一致。migration 37）。entry_date・請求書番号・請求先・決済方法は比較しない。判定の相手は当月の既存行だけで、`p_rows` 内の同一内容の行どうしは除かない。比較列を変えるときはテスト `supabase/tests/database/copy_extra_entries.test.sql` も更新する。
- 一意制約にしない理由: 同一内容の明細（同日の交通費 2 件など）は正当に存在し得るため。
- `p_rows` の `entry_date` はすべて `p_target_month` の月内でなければならない（NULL・他月が混ざると `INVALID_INPUT` 22023。`p_target_month` NULL・配列でない・要素がオブジェクトでない場合も同様）。戻り値は `inserted_count` / `skipped_count`。
- SECURITY INVOKER。ロック取得前に `auth_user_class()` が経理・管理者か確認し、それ以外は `FORBIDDEN`（42501）（書き込めない利用者がロックを持ち続けて経理を待たせないため）。確定済みの月へは、登録する行があれば `MONTH_CLOSED`（42501）で拒否される（全行スキップなら何も書かず 0 件で正常終了）。
- 同時実行の再現手順は `docs/testing.md` 3.7「前月コピーの同時実行の再現手順」。

### 5.8 budget_declarations テーブル

recurring_costs / extra_entries と異なり、**所属チームのユーザー全員に自チーム分の書き込みを許可する**（自分で入力するため。ロール・`is_teamleader` に依存しない）。`profiles` の自己 INSERT は `team IS NULL` を必須にしている（チームが書き込み権限になったため、プロフィール未作成のユーザーが PostgREST から任意のチームを名乗れないようにする。チームは管理者がユーザー管理で設定する）。SELECT は**ログイン済みの全ユーザー**の**全チーム**に許可する（`(select auth.uid()) IS NOT NULL`。他チームとの比較・全体把握のため。migration 44。所属チーム未設定の public も可）。INSERT / UPDATE / DELETE は経理・管理者は全行、それ以外は自チーム（`profiles.team` 一致）の行のみ。所属チーム未設定は閲覧のみ。UPDATE は WITH CHECK でも team を制約し他チームへの付け替えを防ぐ。

#### 確定月の編集ロックと直列化（migration 38）

書き込みポリシー（ヘッダ・明細の INSERT / UPDATE / DELETE）に `NOT private.is_budget_month_closed(target_month)` を加え、確定済みの月は全ロールで拒否する。RLS だけでは確定のコミットをまたいだ書き込みを防げないため、月単位の advisory lock（`private.lock_budget_month`。ロッククラス 222）で直列化する。書き込みトリガー（`guard_budget_closed_month_*`）と `save_budget_declaration` は共有ロックを取って確定済みを再確認し、確定（`budget_declaration_closings` の BEFORE INSERT トリガー）は排他ロックを取る。確定済みの月への書き込みは `MONTH_CLOSED`（SQLSTATE 42501）。削除は RLS の USING が確定月の行を隠して 0 行（エラーなし）になり「確定月」と「削除済み」を区別できないため、`delete_budget_declaration(p_declaration_id, p_team)`（SECURITY INVOKER。共有ロック → 確定判定 → DELETE、削除した行の id を返す。0 行 = 対象なし or 権限なし）を経由する。RLS が適用されない実行者（postgres / service_role）はトリガーの対象外。参考実装は損益計算書の月次収支確定（5.14。ロッククラス 148）。

- 判定は `public.can_access_team_budget(text)`（`auth_user_class()` / `auth_user_team()` を呼ぶ）に切り出している。ヘッダ・明細で 10 箇所必要なため、逐語コピーだと将来ロール条件を変えたとき 1 箇所直し忘れて古いルールが残る（エラーにならない）RLS バグを踏みやすい。行ごとに評価されるが行数は小さいため許容している。
- アプリ側にも同じ判定がある（`app/utils/budgetDeclaration.ts` の `BUDGET_WRITE_ALL_TEAMS_CLASSES`（accounting / admin）と `ownBudgetTeams` / `canWriteBudgetTeam`。閲覧は全ユーザーのため `/budget-declarations` は `AUTH_ONLY_ROUTES`）。条件を変えるときは **DB とアプリの両方**を直す。

#### declared_by の扱い（DB が保証する範囲）

INSERT の WITH CHECK に限り、経理・管理者以外には `declared_by` = 自分自身の profiles.id を強制する（経理・管理者は代理入力があるため制約しない）。**これは INSERT 単体のなりすまし防止にとどまり、UPDATE 経由で他人名義に付け替える迂回は塞げない**（WITH CHECK から OLD 行を参照できず、明細の書き込みも親ヘッダの team だけで判定するため、UPDATE だけ縛っても意味がなく、縛ると既存行をそのまま書き戻す更新や profiles 削除前の付け替え運用が 42501 になる）。したがって `declared_by` は**アプリが最終更新者で更新する表示・監査補助用の項目**とし、改ざん耐性のある監査証跡が必要になった時点で BEFORE UPDATE トリガーによる強制を検討する。

### 5.9 budget_declaration_items テーブル

SELECT は 5.8 と同じくログイン済みの全ユーザーの全チームに許可する。書き込み（INSERT / UPDATE / DELETE）は親ヘッダへの EXISTS で 5.8 と同じ条件（`can_access_team_budget(d.team)` かつ確定月でないこと）を課す。SELECT が書き込みより広くなったため、以前の `FOR ALL` 1 本からコマンド別のポリシーに分けた（UPDATE / INSERT は WITH CHECK でも同条件を課し、`declaration_id` の書き換えによる他チームへの付け替えを防ぐ）。

#### 申告の原子的な保存（`save_budget_declaration`）

`saveBudgetDeclaration()`（`app/utils/supabase/budgetDeclarations.ts`）はこの関数を 1 回呼ぶだけで、ヘッダの作成/更新と明細の全削除・全登録を 1 トランザクションで行う（以前は別々の呼び出しで、全削除後の INSERT 失敗で明細が失われる不具合があった）。明細は「差し替え」方式（フォームの配列が最終形のため diff 追跡は不要）。

- SECURITY INVOKER。書き込み可否は 5.8 / 5.9 の RLS がそのまま適用される。対象月が確定済みなら先頭で `MONTH_CLOSED`（SQLSTATE 42501）を返し（共有ロックを取ってから判定）、RLS の汎用エラーと区別できる。
- `declared_by` はクライアントから受け取らず `auth.uid()` から解決する。UPDATE 経路は RLS が `declared_by` を見ないため、なりすまし防止はこの関数内だけで担保している。
- `p_completed`（migration 39）で完了状態を同じトランザクションで更新する。`true` は未完了なら `now()` / 保存者を設定し、**完了済みなら `completed_at` / `completed_by` を保持**、`false` は両方 NULL に戻す、`NULL`（省略）は変更しない。`completed_by` も `declared_by` と同様に `auth.uid()` から解決してクライアントからは受け取らない。ただし保証は**この関数を経由した場合に限る**: テーブルへの直接の書き込みは RLS が `completed_at` / `completed_by` の値を見ないため、書き込み権限のある利用者が PostgREST から値を設定できる（`declared_by` の UPDATE 経路と同じ制約。改ざん耐性のある監査が必要になった時点でトリガーでの強制を検討する）。`completed_at` と `completed_by` は CHECK で同時に NULL / 非 NULL。
- `p_declaration_id` 指定時は `team` / `target_month` も一致する行のみ更新し、該当なしは `DECLARATION_NOT_FOUND`（SQLSTATE P0002）。
- 存在しない `manager_id` は FK 違反（23503）で全体ロールバックされる（アプリは事前に `assertManagerIdsExist()` で確認）。
- 本番反映は **マイグレーションを先に適用してからアプリをデプロイ**する（新アプリが呼ぶ 6 引数の関数が無いと保存が失敗する）。`p_completed` は `DEFAULT NULL`（変更なし）のため、適用後に旧アプリが動いている間の保存もエラーにならず、完了状態は変わらない。旧 5 引数のシグネチャは DROP 済み。
- `app/lib/database.types.ts` は手で保つファイル（手順は `CLAUDE.md` を参照）。次の DEFAULT 付き引数と `save_budget_declaration` の呼び出し方の説明も、このファイルに手書きのコメントとして残している。
- `p_declaration_id` / `p_comment` / `p_completed` に `DEFAULT NULL` を付けているのは、`supabase gen types` が引数を DEFAULT の有無でしか区別せず、付けると生成型が省略可能（`?:`）になり呼び出し側が `undefined` を渡せるため。DEFAULT 付き引数は SQL 構文上末尾に置く。

### 5.10 budget_declaration_reminder_days テーブル

admin / accounting のみ SELECT / INSERT / UPDATE / DELETE（`auth_user_class() IN ('admin', 'accounting')`。`can_access_team_budget` とは異なり所属チームだけでは書き込めない）。teamleader / public は 0 行・書き込み不可。`anon` は ALL REVOKE。cron は service role で読むため RLS 対象外。全置換 RPC は SECURITY INVOKER で RLS に従い、さらに関数内でロールを明示チェックする（3.11）。

### 5.11 budget_recurring_items テーブル

SELECT はログイン済みの全ユーザーの全チームに許可し、INSERT / UPDATE / DELETE は 5.8 と同じ `can_access_team_budget`（migration 44 で `FOR ALL` 1 本をコマンド別に分けた）。新規申告作成時の展開（`getActiveBudgetRecurringItems`）は通常の SELECT で、自チームを指定して取得する。展開先の `budget_declaration_items` への INSERT は 5.9 の RLS に従う。

#### 一括保存（`save_budget_recurring_items`）

保存処理（`app/utils/supabase/budgetRecurringItems.ts`）は、保存前の検証（分類マスタ・担当者・書き込み可能なチームの判定）の後にこの関数を 1 回呼ぶだけで完結する。新規・編集・削除・並び順の再採番を 1 トランザクションで行い、**1 件でも競合すれば全体を中止して何も保存しない**（途中まで反映された状態にならない）。migration 45。

- SECURITY INVOKER（書き込み権限は呼び出し元の RLS = `can_access_team_budget` が担う）。行は `id` 順に `FOR UPDATE` でロックし、確認と書き込みを一体にする。同時に保存された場合は、後続はロック解除後の最新の `updated_at` で判定される。
- 行ごとの `state` は `new`（INSERT）/ `edited`（全列 UPDATE）/ `removed`（DELETE）/ `keep`（触っていない行。`display_order` の再採番だけ）。
- `edited` / `removed` の行が存在しない（`removed` は無視）、または `updated_at` が表示時と異なる場合は、`BUDGET_RECURRING_ITEMS_CONFLICT`（SQLSTATE `40001`）で中止する。`keep` の行が変わっている・消えている場合は無視する（他の行の保存を妨げない）。
- RLS で更新できない他チームの行は、`edited` / `removed` なら `42501`、`keep` なら無視する。

### 5.12 profit_loss_adjustments テーブル

書き込みは経理・管理者のみ。SELECT は経理・管理者・チームリーダーが全行（チームリーダーは他チームとの比較・全体把握のため。migration 40。判定は `private.can_view_pl_adjustment`）。public は不可。INSERT / UPDATE の WITH CHECK は `adjusted_by` が呼び出し本人の profiles.id であることも要求する。

- 判定ヘルパ `private.can_view_pl_adjustment` は `private` スキーマに置く（`supabase/config.toml` の `[api].schemas` に含めず、PostgREST から直接ルーティングされない）。かつては対象行のチーム（`pl_adjustment_team`）を辿って絞っていたが、migration 40 で全チーム閲覧に広げたため、チーム解決のヘルパ（`pl_adjustment_team` / `pl_label_team` / `pl_label_matter_user`）は削除した。
- **本番の注意**: PostgREST の公開スキーマは Supabase ダッシュボード（Project Settings > API > Exposed schemas）の設定で決まり、マイグレーションからは変えられない。既定は `public, graphql_public` のみで安全だが、`private` は追加しないこと。
- 確定済みの月の編集ロック（migration 27）: INSERT / UPDATE / DELETE のポリシーに `NOT private.is_pl_month_closed(target_month)`。詳細は 5.14。

#### 実績額修正の原子的な保存（`save_profit_loss_adjustment`）

保存処理（`app/utils/supabase/profitLossAdjustments.ts`）はこの関数を 1 回呼ぶだけで完結する。対象行を `FOR UPDATE` でロックして元データ金額を取得 → 差分計算 → 部分 UNIQUE インデックスへの upsert を 1 トランザクションで行い、取得から書き込みまでの間の元データ変更や同時保存の競合を防ぐ。

- SECURITY INVOKER（対象データの SELECT・調整の書き込みとも呼び出し元ロールの RLS が適用される。経理・管理者は全行を読めるため RLS 迂回の懸念がなく `public` に置ける）。
- `adjusted_by` は `auth.uid()` から解決する。
- `p_actual_amount` は列精度に合わせ差分計算の直前に `round(…, 2)` する（画面の `NumberInput` も小数第 2 位までに制限。ずれると差分が 0 になり CHECK に想定外に抵触する）。
- 差分 0 は既存調整を削除する。削除対象が無ければ `deleted = false` かつ `adjustment_amount = 0` を返し、呼び出し側は「変更なし」として扱う（`resolveSaveAdjustmentOutcome`。migration 31）。
- 差分が 0 でないのに理由が空なら `REASON_REQUIRED`。確定済みの月は `MONTH_CLOSED`。

### 5.13 profit_loss_labels テーブル

書き込みは経理・管理者のみ（`updated_by` は呼び出し本人に限る）。SELECT は経理・管理者・チームリーダーが全行（チームリーダーにも上書き後のタイトルを見せるため。migration 40）。public は不可。閲覧判定は `private.can_view_pl_label`（`private` スキーマ）。

#### 表示タイトルの保存（`save_profit_loss_label`）

`p_label` の前後空白を除去し、空なら削除（`deleted = true`）、それ以外は対象の部分 UNIQUE インデックスへ upsert する（PostgREST の upsert では推論できないため関数にしている）。200 文字超は `LABEL_TOO_LONG`。`updated_by` は `auth.uid()` から解決。SECURITY INVOKER。

### 5.14 profit_loss_closings / profit_loss_closing_lines テーブル

月次収支確定（Issue #148）の権限:

- ヘッダの SELECT は全ログインユーザー（担当者の案件編集画面で「確定済みの月」の注意を出すため。金額を持たない）。DELETE（確定解除）は経理・管理者のみ。
- **ヘッダ・明細の追加・更新はテーブル権限を authenticated に付与せず、RPC（`save_profit_loss_closing` / `apply_profit_loss_closing_diffs`。SECURITY DEFINER で関数内で経理・管理者を判定し、それ以外は `FORBIDDEN`）経由のみ。** 確定者・反映者（id と氏名）を `auth.uid()` から解決するため、他人名義や権限外の書き込みはできない。
- **ただし RPC は public スキーマにあり、経理・管理者は PostgREST から直接呼べ、その場合の明細の値は検証しない**（集計し直した値を渡すのは Server Action の責務で、経理・管理者は信頼する前提。損益調整の記録を残さず確定値を変える操作まで防ぐなら、RPC の EXECUTE を authenticated から外し service_role で呼ぶ構成に変える必要がある）。
- 明細の SELECT は経理・管理者・チームリーダーが全行（ライブ集計時の RLS と同じ範囲で、確定の前後で表示範囲を変えない。migration 40）。public は明細を読めない。anon は両テーブルとも権限なし。

#### 確定中の編集ロック（migration 27）

- profit_loss_adjustments（5.12）と extra_entries（5.7）のポリシーに `NOT private.is_pl_month_closed(...)`（`private` の SECURITY DEFINER。`date_trunc` で月に丸めて確定済みか判定、NULL は false）を追加。`save_profit_loss_adjustment` は利用者に分かるよう関数の先頭でも判定し、固定文言の例外 `MONTH_CLOSED` を返す。
- recurring_costs のポリシーは変更しない（定期費用マスタは確定済みの月があっても編集でき、確定済みの月の表示は確定明細から行うため影響しない）。
- 案件の明細・定期費用の削除に伴う損益調整の CASCADE 削除は参照整合性のアクションで、RLS が適用されず妨げられない。
- アプリ側（`bulkUpsertExtraEntry` / `deleteProfitLossAdjustment`）は、RLS に拒否された UPDATE / DELETE が 0 行になるだけである点を、書き込み前の判定・削除件数の確認で補い利用者にエラーを返す。
- migration 34 以降は 6.4 のトリガーが RLS より先に判定するため、確定済みの月への INSERT と日付・対象月の変更（UPDATE の変更後の月）は RLS 違反ではなく `MONTH_CLOSED`（どちらも 42501）で拒否される。確定済みの月の行の UPDATE / DELETE は従来どおり RLS の USING で 0 行になる。

#### 確定と書き込みの直列化（Issue #171、migration 34）

RLS の `is_pl_month_closed` は文のスナップショットで評価されるため、READ COMMITTED では「書き込みが RLS を通過（未確定・未コミット）→ 確定がコミットし直後の再集計も書き込みを見ない → 書き込みがコミット」の順で、書き込みが確定値に含まれないままロックされていた（経理追加収支・管理費の調整は確定後の変更検知の対象外で誰も気付けない）。

月単位の advisory lock（`private.lock_pl_month`、6.4）で直列化する。確定は対象月の**排他ロック**、損益調整・経理追加収支の書き込み（トリガー）は行の月の**共有ロック**を取り、書き込み側はロック取得後に確定済みかを判定し直す。

- 確定より先にロックを取った書き込み: 確定はその終了まで待つため、確定のコミット後の再集計に必ず含まれ、違いがあれば確定値を取り直す。
- 確定が先の場合: 書き込みは確定のコミットまで待ち、ロック取得後の判定で `MONTH_CLOSED` で拒否される（トランザクションごとロールバック。`save_extra_entries` も全体ロールバック）。
- ロック取得後の判定が確定のコミットを見られるのは、READ COMMITTED の VOLATILE plpgsql 関数が式ごとに新しいスナップショットを取るため（トリガー内でロック取得と判定を別の文にしている）。PostgREST が READ COMMITTED（既定）であることが前提。
- デッドロック: 保持中のロックを待つ循環は起きない（書き込みは共有ロック、確定は 1 つの月の排他ロックのみ）。複数月にまたがる書き込みと別月の確定が同時に待つと、待ち行列の公平性による一時的な待ちの循環（ソフトなデッドロック）は起こり得るが、PostgreSQL のデッドロック検出（`deadlock_timeout` 後）が待ち行列を並べ替えて解消するため、エラーにはならず待ちが延びるだけ。
- 確定の解除・反映・見送りはロックを取らない（解除と競合した書き込みは、解除のコミット前に判定すれば確定済みとして拒否されるだけで確定値から漏れない）。
- 塞がない経路: 案件（matters / business / costs）は確定済みの月でも編集でき、確定後の変更は確定明細とライブ集計の差分検知（5.15）で検出する。定期費用も確定後に編集でき、確定値には影響しない。

#### 確定（`save_profit_loss_closing`）

`save_profit_loss_closing(p_target_month, p_lines jsonb, p_closing_id bigint DEFAULT NULL)`（SECURITY DEFINER。経理・管理者以外は `FORBIDDEN`）は、ヘッダの追加と明細の全置換を 1 トランザクションで行う（途中失敗で確定前に完全ロールバック）。

- `p_closing_id` NULL: 新規の確定のみ。既に確定済みなら `ALREADY_CLOSED`（古い画面から確定して他の経理の確定・見送りを黙って上書きしないため。Server Action は再読み込みを促す）。
- `p_closing_id` 指定: 確定直後の再検証による取り直しに限り、同じ月・自分が確定したヘッダ（id 一致）の確定者・確定日時を更新し、反映者・反映日時をクリアし、見送り記録・明細を置き換える。一致しなければ `CLOSING_CHANGED`。
- `closed_by` / `closed_by_name` は `auth.uid()` から解決する。明細はサーバ（`closeProfitLossMonth`、`app/utils/supabase/profitLossClosings.ts`）が当月をライブ集計し直して組み立て、クライアントの金額は使わない。集計から確定のコミットまでは編集ロックが掛かっていないため、コミット後にもう一度集計し、違いがあれば自分の確定の id を渡して取り直す。
- 権限判定の後・書き込みの前に対象月の排他ロック（`private.lock_pl_month(p_target_month, true)`）を取る（migration 34）。

### 5.15 profit_loss_closing_dismissals テーブルと反映・見送りの関数

見送り記録の SELECT は経理・管理者のみ（チームリーダーには確定値だけ見せ、アラート・差分は見せない）。追加・更新・削除はテーブル権限を付与せず、RPC（SECURITY DEFINER）経由のみ（5.14 と同じ前提。経理・管理者が RPC を直接呼んだ場合の値は検証しない）。

関数はいずれも SECURITY DEFINER・`SET search_path = ''`で、先頭で経理・管理者でなければ `FORBIDDEN`（42501）。値は Server Action がサーバ側でライブ集計し直して渡す。Server Action は画面で見ていた明細の状態（在否・実績額・チーム・分類）も受け取り、現在の状態と食い違えば反映・見送りを拒否する（利用者が見ていない変更を反映・見送りしない）。

- `apply_profit_loss_closing_diffs(p_target_month, p_upsert_lines, p_delete_keys)`: 反映。確定ヘッダを `FOR UPDATE` でロック（未確定なら `NOT_CLOSED`）し、選択明細を確定明細へ upsert / delete、該当する見送り記録を削除、反映者・反映日時を更新する（確定者・確定日時は保持）。business / cost のみ。
- `dismiss_profit_loss_closing_diffs(p_target_month, p_dismissals)`: 見送り。その時点のライブの状態を見送った人・日時とともに upsert する。
- `undo_profit_loss_closing_dismissals(p_target_month, p_keys)`: 見送りの取り消し（未処理の差分に戻す）。

### 5.16 リリース用の読み取り専用ロール（migration_reader。migration 36）

リリース PR 作成ワークフロー（`.github/workflows/release-pr.yml`）が本番の `supabase migration list` を読むための専用ロール（アプリ・PostgREST・RLS からは使わない）。権限は `supabase_migrations.schema_migrations` の SELECT のみで、業務テーブルには権限が無く、接続情報が漏れても業務データは読めない（`pg_read_all_data` や `BYPASSRLS` も付けない）。パスワードはマイグレーションに書かず、本番で `psql` の `\password migration_reader` で設定する（ローカルではロールと権限だけ再現され接続には使えない）。接続情報の登録とローテーションは `docs/release.md` の「読み取り専用ロール」を参照。

### 5.17 slack_notification_settings テーブル

admin / accounting のみ SELECT / UPDATE（5.10 と同じ構成）。INSERT / DELETE のポリシーは無く、`authenticated` からの INSERT / DELETE 権限も REVOKE している。送信時の読み取りは service role のため RLS 対象外。

## 6. トリガー

### 6.1 updated_at 更新トリガー

`update_updated_at_column()`（`NEW.updated_at = now()`）を、`updated_at` を持つ業務テーブルの BEFORE UPDATE に設定している（select_option_types / select_options / profit_loss_closing_lines / dismissals を除く）。`search_path = ''` は migration 07 で設定したもので、`CREATE OR REPLACE FUNCTION` は SET 句も置き換えるため定義側で明示する。関数が `updated_at` を無条件に上書きするため、値を補正する UPDATE を書くときはトリガーを一時的に無効化する必要がある。

### 6.2 案件更新検知トリガー

`detect_matter_updates()`（BEFORE UPDATE ON matters）: 経理申請済み（`is_fixed`）かつ経理確認未完了（`is_completed = false`）の案件が更新されたら `has_updates` を true にする（経理側でのハイライト表示の元）。

### 6.3 売上金額チェック

経理申請時の売上金額 0 の警告は DB トリガーではなくアプリ側で実装している。

### 6.4 月次収支確定との直列化トリガー（Issue #171、migration 34）

損益調整・経理追加収支の書き込みを同じ月の確定と直列化する BEFORE 行トリガー（設計の詳細は 5.14「確定と書き込みの直列化」）。

- `private.lock_pl_month(p_month date, p_exclusive boolean)`: 月単位の advisory lock（`pg_advisory_xact_lock(148, YYYYMM)` / `..._shared`）。トランザクション終了まで保持。NULL は何もしない。SECURITY DEFINER。前月コピーの 140 とは別の名前空間（5.7）。
- `private.guard_pl_closed_month_write()`（トリガー関数。SECURITY INVOKER）: `TG_ARGV[0]` の列（月）について、`row_security_active` が true（RLS が適用される利用者の書き込み）のときだけ、書き込んだ行の月（INSERT は新しい行、DELETE は元の行、UPDATE は変更前と変更後の両方）の共有ロックを取り、別の文で `is_pl_month_closed` を判定し直して確定済みなら `MONTH_CLOSED`（42501）で拒否する。
- 対象は `profit_loss_adjustments`（`target_month`）と `extra_entries`（`entry_date`）。
- BEFORE トリガーは RLS の WITH CHECK より先に走るため、書き込み権限の無い利用者（teamleader のみの利用者 / public）の INSERT も RLS で拒否される前に共有ロックを取る（トランザクション終了で外れるため実害はない）。
- anon: 日付ありの経理追加収支の INSERT は、`private` の関数を実行できず `permission denied` で拒否される（従来の RLS 違反とメッセージが違うだけで書き込めないのは同じ。日付なしの行はロックを取らず従来どおり RLS 違反）。損益調整は anon にテーブル権限が無く、トリガーより前に拒否される。
- RLS をバイパスするロール（service_role・テーブル所有者）と、損益調整の CASCADE 削除（`row_security_active` が false）は対象外。

## 7. 認証フック（Custom Access Token Hook）

`public.custom_access_token_hook(event jsonb)` は Supabase Auth がトークン発行/リフレッシュ時に呼ぶフック。`profiles.class` / `is_teamleader` を JWT の `user_class` / `user_is_teamleader` クレームに載せ、`middleware.ts` が制限ルートのロール判定を DB クエリなしで行えるようにする（middleware 側の挙動・フォールバック・503 判定は [specification.md 3 章](specification.md) が正本）。定義は migration 15 を migration 16 で是正し、migration 41 で `user_is_teamleader` を追加したもの。

- フェイルセーフ: `claims` が object でない場合や、uuid 不正・権限ドリフトなど想定外の例外では、`RAISE WARNING` のうえクレーム付与を諦めて `event` をそのまま返す（トークン発行自体は失敗させない）。
- 実行は `supabase_auth_admin` のみ（`REVOKE ... FROM PUBLIC, authenticated, anon`）。`profiles.class` を読むため `supabase_auth_admin` 向けの SELECT ポリシーを追加し、テーブル権限は `SELECT (user_id, class, is_teamleader)` の**列単位 GRANT** に絞る（RLS の `USING (true)` は行スコープの制御であり、email / slack_id / team などの PII 列は列単位 GRANT で読めないようにしている）。
- 有効化:
  - ローカル: `supabase/config.toml` の `[auth.hook.custom_access_token]`。フックは関数の存在が前提のため、pull 後は再起動だけでなく **`supabase db reset` でマイグレーションを適用する**（関数が無い状態でフックが有効だとトークン発行が失敗し、全ユーザーがログインできなくなる）。
  - 本番: Supabase ダッシュボード（Authentication > Hooks）で「Custom Access Token」に `public.custom_access_token_hook` を設定する（**手動対応**）。マイグレーション適用前に有効化すると同様にログイン不能になるため、**適用後に有効化する**。
- `class` / `is_teamleader` の変更は、対象ユーザーのトークンのリフレッシュ（既定で最大約 1 時間）または再ログインまで JWT に反映されない。即時反映が必要な用途では middleware だけに依存しない。新規ユーザーの初回トークンはプロフィール作成前に発行されるため必ず `user_class: null` / `user_is_teamleader: null` で、middleware が DB にフォールバックする（どちらかのクレームが無効ならフォールバック。migration 41 適用直後の旧トークンも `user_is_teamleader` が無いためフォールバックで動作する。フックは有効化済みなので追加のダッシュボード操作は不要）。
- PostgREST の `JWT issued at future`（`getUser()` は通るのに直後の REST が 401 になる）は、アプリや Supabase の設定ではなく PostgREST 側の不具合（現在時刻のキャッシュの誤読。上流 issue [#5172](https://github.com/PostgREST/postgrest/issues/5172) / [#5196](https://github.com/PostgREST/postgrest/issues/5196)）で、14.18 / 16.3 で修正済み。クライアントは `app/utils/supabase/postgrestFetch.ts` が同じトークンを短い待ち（200ms / 500ms の計 2 回）のあと再送する（refresh はしない。判定は**メッセージ一致のみ**。`PGRST303` は `JWT expired` など他の `JwtClaimsErr` と同じコードのため、コードだけで再試行すると期限切れトークンを無駄に再送する）。これは修正前バージョン向けの保険で、本番の PostgREST が 14.18 以上と確認できたら削除してよい（Supabase ダッシュボード → Settings → Infrastructure）。

## 8. 初期データ

選択肢マスタの初期値は `supabase/migrations/20260523053842_06_seed_select_options.sql` と、経理追加収支の追加（`extra_income_category` / `extra_expense_category` / `payment_method`。migration 14）で投入する。経理追加収支の収入分類・支出分類の値は暫定で、管理画面から実運用に合わせて編集する。
