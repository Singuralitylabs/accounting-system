# データベース設計書

## 1. 概要

本設計書は、未来技術推進協会のための経理システムで使用するデータベース設計について記述しています。

### 1.1 使用データベース

- PostgreSQL (Supabase)

### 1.2 スキーマ

- public

### 1.3 タイムゾーン方針

- **セッションタイムゾーンは UTC**（PostgreSQL / Supabase の既定）。`supabase/migrations/` は `ALTER DATABASE ... SET timezone` を含まない。旧ローカル手適用 SQL にあった当該設定は、正であるマイグレーション経路では一度も適用されていなかった。hosted Supabase では `ALTER DATABASE` が失敗しうるため、Phase 0 でも追加しない。
- **`inserted_at` / `updated_at` のカラム DEFAULT と `update_updated_at_column` トリガーは `now()`**（`timestamptz`）である。セッション TZ に依存せず、常に正しい絶対時刻を保存する。`20260830040000_18_fix_timestamp_defaults_to_now.sql` で変更した。
- **変更前は `timezone('Asia/Tokyo'::text, now())`（選択肢マスタは `timezone('utc'::text, now())`）だった。** `timezone(zone, timestamptz)` の戻りは **TZ なし `timestamp`**（そのゾーンの壁時計）であり、これを `timestamptz` 列へ入れると **セッション `TimeZone` のローカル時刻として解釈**される。セッション TZ が UTC のため、`Asia/Tokyo` 指定の列には実際より **約 9 時間後** の絶対時刻が保存されていた（`utc` 指定の列はセッションが UTC のため結果的に正しい値）。
- **既存行のずれはマイグレーション 18 で補正した。** 調査の結果、[#80](https://github.com/Singuralitylabs/accounting-system/issues/80) のカットオーバーで旧 Supabase から移送された行も含め、DEFAULT / トリガー由来の値は一様に +9h ずれていた（旧 DB のセッション TZ も UTC だった）。

  判定は `matters.inserted_at`（アプリが `new Date().toISOString()` で設定＝常に正しい）と `costs.inserted_at`（DEFAULT 由来）の差で行った。案件登録時に両者は同時に書かれるため、その差がずれの大きさになる。実データでは 20 案件中 19 案件が 9 時間差だった。

  ```sql
  WITH first_cost AS (
    SELECT matter_id, min(inserted_at) AS first_inserted_at FROM costs GROUP BY matter_id
  )
  SELECT round(EXTRACT(EPOCH FROM (f.first_inserted_at - m.inserted_at)) / 3600) AS 差_時間,
         count(*) AS 案件数
    FROM first_cost f JOIN matters m ON m.id = f.matter_id
   GROUP BY 1 ORDER BY 1;
  ```

  | 列                                                                                         | 対応                                                                                                                                                                                                                                                                |
  | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `costs` / `business` / `recurring_costs` / `extra_entries` の `inserted_at` / `updated_at` | アプリ側に書き込み経路がなく全行が DEFAULT / トリガー由来のため、**全行を `- interval '9 hours'` で補正**                                                                                                                                                           |
  | `matters.updated_at` / `profiles.updated_at`                                               | アプリは INSERT 時に `inserted_at` と `updated_at` を同じ値で設定するため、両者がほぼ一致する行は未更新（正しい値）。UPDATE を経た行はトリガー由来で `inserted_at` との差が必ず 9 時間以上になる。**`updated_at > inserted_at + interval '1 second'` の行のみ補正** |
  | `matters.inserted_at` / `profiles.inserted_at`                                             | アプリが明示指定するためずれていない。**補正しない**                                                                                                                                                                                                                |
  | `select_option_types` / `select_options` の `created_at` / `updated_at`                    | 旧 DEFAULT が `timezone('utc', ...)` でセッションが UTC のためずれていない。**補正しない**                                                                                                                                                                          |

  補正の `UPDATE` は `BEFORE UPDATE` トリガーを一時的に無効化して実行している。`update_*_updated_at` は `NEW.updated_at` を `now()` で無条件に上書きするため補正値が現在時刻で潰れ、`matters` では `detect_matter_updates` が `has_updates` を立ててしまうためである。

  **残課題**: 上記の判定で差が 0 時間だった 1 案件は、`matters.inserted_at` 自体が DEFAULT 由来（手動投入など）で +9h ずれている可能性がある。機械的に判別できないため補正対象から外している。次の SQL で洗い出して個別に判断すること。

  ```sql
  WITH first_cost AS (
    SELECT matter_id, min(inserted_at) AS first_inserted_at FROM costs GROUP BY matter_id
  )
  SELECT m.id, m.title, m.inserted_at, m.updated_at, f.first_inserted_at
    FROM first_cost f JOIN matters m ON m.id = f.matter_id
   WHERE f.first_inserted_at < m.inserted_at + interval '1 hour';
  ```

- **アドホック SQL で日付境界を切る場合**はセッション TZ に頼らず、`timezone('Asia/Tokyo', ...)` または `AT TIME ZONE 'Asia/Tokyo'` を明示すること。`now()::date` や素の `date_trunc` は UTC 日付になり、JST 0:00〜9:00 で日付がずれる。
- **Vitest** は `vitest.config.ts` で `TZ=Asia/Tokyo` を固定する。Next.js アプリのプロセス TZ は実行環境依存であり、日付表示は `app/utils/formatter.ts` などが `new Date()` のローカル TZ に従う。

## 2. テーブル一覧

| テーブル名               | 説明                                                                |
| ------------------------ | ------------------------------------------------------------------- |
| profiles                 | ユーザー情報を管理するテーブル                                      |
| matters                  | 案件情報を管理するテーブル                                          |
| costs                    | コスト情報を管理するテーブル                                        |
| business                 | 取引先情報を管理するテーブル                                        |
| select_option_types      | 選択肢の種類を管理するテーブル                                      |
| select_options           | 選択肢の値を管理するテーブル                                        |
| recurring_costs          | 定期費用（管理費）を管理するテーブル                                |
| extra_entries            | 経理追加収支（案件に紐づかない収入・支出）を管理するテーブル        |
| budget_declarations      | 事前収支申告（チーム×対象月の見込み収支）のヘッダを管理するテーブル |
| budget_declaration_items | 事前収支申告の明細（見込み収入・支出の内訳）を管理するテーブル      |

## 3. テーブル詳細

### 3.1 profiles テーブル

ユーザー情報を保持するテーブル

| カラム名    | データ型                 | 制約                                                         | 説明                                              |
| ----------- | ------------------------ | ------------------------------------------------------------ | ------------------------------------------------- |
| id          | bigint                   | PRIMARY KEY, GENERATED BY DEFAULT AS IDENTITY                | 主キー                                            |
| user_id     | uuid                     | NOT NULL, UNIQUE, FOREIGN KEY (auth.users) ON DELETE CASCADE | Supabase Auth のユーザー ID                       |
| email       | text                     | NOT NULL                                                     | メールアドレス                                    |
| name        | text                     | NOT NULL                                                     | ユーザー名                                        |
| slack_id    | text                     | NULL                                                         | Slack ID (通知用)                                 |
| class       | text                     | DEFAULT 'public'                                             | ユーザー権限 (public/accounting/admin/teamleader) |
| team        | text                     | NULL                                                         | 所属チーム（teamleader権限時に必要）              |
| inserted_at | timestamp with time zone | NOT NULL, DEFAULT now()                                      | 作成日時                                          |
| updated_at  | timestamp with time zone | NOT NULL, DEFAULT now()                                      | 更新日時                                          |

インデックス:

- user_id

### 3.2 matters テーブル

案件情報を保持するテーブル

| カラム名             | データ型                 | 制約                                                  | 説明               |
| -------------------- | ------------------------ | ----------------------------------------------------- | ------------------ |
| id                   | bigint                   | PRIMARY KEY, GENERATED BY DEFAULT AS IDENTITY         | 主キー             |
| title                | text                     | NOT NULL                                              | 案件名             |
| category             | text                     | NOT NULL                                              | 分類               |
| team                 | text                     | NOT NULL                                              | チーム             |
| description          | text                     | NULL                                                  | 説明               |
| start_date           | date                     | NULL                                                  | 案件開始日         |
| is_fixed             | boolean                  | DEFAULT false                                         | 経理申請済みフラグ |
| is_completed         | boolean                  | DEFAULT false                                         | 経理確認完了フラグ |
| has_updates          | boolean                  | DEFAULT false                                         | 申請後更新フラグ   |
| total_cost           | numeric(15,2)            | DEFAULT 0                                             | 合計コスト         |
| cost_count           | integer                  | DEFAULT 0                                             | コスト数           |
| total_amount         | numeric(15,2)            | DEFAULT 0                                             | 合計請求額         |
| business_count       | integer                  | DEFAULT 0                                             | 取引先数           |
| accounting_memo      | text                     | NULL                                                  | 経理メモ           |
| unchecked_cost_count | integer                  | NOT NULL, DEFAULT 0                                   | 未払いコスト数     |
| user_id              | bigint                   | NOT NULL, FOREIGN KEY (profiles.id) ON DELETE CASCADE | ユーザー ID        |
| parent_matter_id     | bigint                   | NULL, FOREIGN KEY (matters.id) ON DELETE SET NULL     | 親案件 ID          |
| inserted_at          | timestamp with time zone | NOT NULL, DEFAULT now()                               | 作成日時           |
| updated_at           | timestamp with time zone | NOT NULL, DEFAULT now()                               | 更新日時           |

インデックス:

- user_id
- parent_matter_id

### 3.3 costs テーブル

コスト情報を保持するテーブル

| カラム名       | データ型                 | 制約                                                 | 説明             |
| -------------- | ------------------------ | ---------------------------------------------------- | ---------------- |
| id             | bigint                   | PRIMARY KEY, GENERATED ALWAYS AS IDENTITY            | 主キー           |
| name           | text                     | NOT NULL                                             | コスト名         |
| item           | text                     | NOT NULL                                             | 品目             |
| payment_target | text                     | NOT NULL                                             | 支払い先         |
| price          | numeric(15,2)            | NOT NULL                                             | 金額             |
| period         | date                     | NULL                                                 | 支払い期限       |
| certificate    | text                     | NOT NULL                                             | 通知方法         |
| withholding    | boolean                  | NOT NULL, DEFAULT false                              | 源泉徴収フラグ   |
| is_completed   | boolean                  | NOT NULL, DEFAULT false                              | 支払い完了フラグ |
| comment        | text                     | NULL                                                 | コメント         |
| matter_id      | bigint                   | NOT NULL, FOREIGN KEY (matters.id) ON DELETE CASCADE | 案件 ID          |
| inserted_at    | timestamp with time zone | NOT NULL, DEFAULT now()                              | 作成日時         |
| updated_at     | timestamp with time zone | NOT NULL, DEFAULT now()                              | 更新日時         |

インデックス:

- matter_id

### 3.4 business テーブル

取引先情報を保持するテーブル

| カラム名     | データ型                 | 制約                                                 | 説明           |
| ------------ | ------------------------ | ---------------------------------------------------- | -------------- |
| id           | bigint                   | PRIMARY KEY, GENERATED ALWAYS AS IDENTITY            | 主キー         |
| name         | text                     | NOT NULL                                             | 取引先名       |
| invoice_date | date                     | NULL                                                 | 請求日         |
| period_date  | date                     | NULL                                                 | 振込期限       |
| amount       | numeric(15,2)            | NULL                                                 | 報酬額         |
| is_completed | boolean                  | NOT NULL, DEFAULT false                              | 確認完了フラグ |
| matter_id    | bigint                   | NOT NULL, FOREIGN KEY (matters.id) ON DELETE CASCADE | 案件 ID        |
| inserted_at  | timestamp with time zone | NOT NULL, DEFAULT now()                              | 作成日時       |
| updated_at   | timestamp with time zone | NOT NULL, DEFAULT now()                              | 更新日時       |

インデックス:

- matter_id

### 3.5 select_option_types テーブル

選択肢の種類を管理するテーブル

| カラム名      | データ型                 | 制約                                   | 説明                                    |
| ------------- | ------------------------ | -------------------------------------- | --------------------------------------- |
| id            | uuid                     | PRIMARY KEY, DEFAULT gen_random_uuid() | 主キー                                  |
| name          | varchar                  | NOT NULL, UNIQUE                       | 種類名 (team/category/item/certificate) |
| display_name  | varchar                  | NOT NULL                               | 表示名                                  |
| category      | information_category     | NOT NULL                               | カテゴリ (Enum 型)                      |
| description   | text                     | NULL                                   | 説明                                    |
| display_order | integer                  | DEFAULT 0                              | 表示順                                  |
| created_at    | timestamp with time zone | NOT NULL, DEFAULT now()                | 作成日時                                |
| updated_at    | timestamp with time zone | NOT NULL, DEFAULT now()                | 更新日時                                |

### 3.6 select_options テーブル

選択肢の値を管理するテーブル

| カラム名      | データ型                 | 制約                                                   | 説明          |
| ------------- | ------------------------ | ------------------------------------------------------ | ------------- |
| id            | serial                   | PRIMARY KEY                                            | 主キー        |
| type_id       | uuid                     | FOREIGN KEY (select_option_types.id) ON DELETE CASCADE | 選択肢種類 ID |
| value         | varchar                  | NOT NULL                                               | 値            |
| display_order | integer                  | DEFAULT 0                                              | 表示順        |
| is_active     | boolean                  | DEFAULT true                                           | 有効フラグ    |
| created_at    | timestamp with time zone | NOT NULL, DEFAULT now()                                | 作成日時      |
| updated_at    | timestamp with time zone | NOT NULL, DEFAULT now()                                | 更新日時      |

ユニーク制約:

- (type_id, value)

### 3.7 recurring_costs テーブル

定期費用（管理費）を保持するテーブル。定期的にかかる費用を登録し、損益計算書の集計時に支払月（適用開始月を起点に支払サイクル間隔ごと）へ全額算入する（実レコードは月ごとに生成しない）。

| カラム名      | データ型                 | 制約                                                          | 説明                                                     |
| ------------- | ------------------------ | ------------------------------------------------------------- | -------------------------------------------------------- |
| id            | bigint                   | PRIMARY KEY, GENERATED ALWAYS AS IDENTITY                     | 主キー                                                   |
| name          | text                     | NOT NULL                                                      | 名称（例: オフィス家賃）                                 |
| item          | text                     | NOT NULL                                                      | 品目（select_options の item と同じ値域）                |
| price         | numeric(15,2)            | NOT NULL                                                      | 支払額（支払サイクル1回あたり）                          |
| team          | text                     | NULL                                                          | 対象チーム（NULL = 全体共通）                            |
| payment_cycle | text                     | NOT NULL, DEFAULT 'monthly', CHECK (monthly/quarterly/yearly) | 支払サイクル（月払い / 四半期払い / 年払い）             |
| start_month   | date                     | NOT NULL                                                      | 適用開始月 = 最初の支払月（月初日で格納: 例 2026-07-01） |
| end_month     | date                     | NULL                                                          | 適用終了月（月初日で格納。NULL = 継続中。当月を含む）    |
| comment       | text                     | NULL                                                          | コメント                                                 |
| inserted_at   | timestamp with time zone | NOT NULL, DEFAULT now()                                       | 作成日時                                                 |
| updated_at    | timestamp with time zone | NOT NULL, DEFAULT now()                                       | 更新日時                                                 |

インデックス:

- team
- start_month

### 3.8 extra_entries テーブル

経理追加収支（案件に紐づかない収入・支出）を保持するテーブル。損益計算書の集計時に entry_date（日付）の属する月へ算入する（収入の請求額 → 売上合計、経費 → 案件費用合計。日付未入力は月未確定）。金額はマイナスを許容し、損益計算書上での減額調整に使う。

| カラム名       | データ型                 | 制約                                                                      | 説明                                                                                 |
| -------------- | ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| id             | bigint                   | PRIMARY KEY, GENERATED ALWAYS AS IDENTITY                                 | 主キー                                                                               |
| entry_type     | text                     | NOT NULL, CHECK (entry_type IN ('income', 'expense'))                     | 種別（income = 収入 / expense = 支出）                                               |
| category       | text                     | NOT NULL                                                                  | 分類（収入時は extra_income_category、支出時は extra_expense_category マスタの値域） |
| entry_date     | date                     | NULL                                                                      | 日付（損益計算書の計上月の判定に使用。NULL = 月未確定）                              |
| invoice_number | text                     | NULL                                                                      | 請求書番号（収入時のみ）                                                             |
| description    | text                     | NOT NULL                                                                  | 内容                                                                                 |
| billing_target | text                     | NULL                                                                      | 請求先（収入時のみ）                                                                 |
| manager_id     | bigint                   | NOT NULL, FOREIGN KEY (profiles.id)（参照アクション指定なし = NO ACTION） | 責任者（メンバー）                                                                   |
| team           | text                     | NULL                                                                      | 対象チーム（NULL = 全体共通）                                                        |
| billing_amount | numeric(15,2)            | NULL, CHECK (billing_amount <> 0)                                         | 請求額（円・税別。マイナス可・0 不可。収入時のみ）                                   |
| expense_amount | numeric(15,2)            | NULL, CHECK (expense_amount <> 0)                                         | 経費（円・税別。マイナス可・0 不可。収入時は任意、支出時は必須）                     |
| payment_method | text                     | NULL                                                                      | 決済方法（payment_method マスタの値域。支出時のみ）                                  |
| inserted_at    | timestamp with time zone | NOT NULL, DEFAULT now()                                                   | 作成日時                                                                             |
| updated_at     | timestamp with time zone | NOT NULL, DEFAULT now()                                                   | 更新日時                                                                             |

CHECK 制約（種別ごとの項目の整合性）:

```sql
-- 収入: 請求額必須・決済方法なし / 支出: 経費・決済方法必須、収入専用項目（請求書番号・請求先・請求額）なし
CHECK (
    (entry_type = 'income' AND billing_amount IS NOT NULL AND payment_method IS NULL) OR
    (entry_type = 'expense' AND expense_amount IS NOT NULL AND payment_method IS NOT NULL
        AND billing_amount IS NULL AND invoice_number IS NULL AND billing_target IS NULL)
)
```

インデックス:

- team
- entry_date
- manager_id

### 3.9 budget_declarations テーブル

事前収支申告のヘッダ。各チームのチームリーダーが翌月のチーム収支（見込み収入・見込み支出）を申告するために使う。1 チーム × 1 対象月につき 1 行。

合計金額はヘッダに非正規化せず、`budget_declaration_items` から集計する（案件の `total_cost` と異なり明細数が小さいため）。

| カラム名     | データ型                 | 制約                                                                      | 説明                                                                                                                                                                                                                                                        |
| ------------ | ------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id           | bigint                   | PRIMARY KEY, GENERATED ALWAYS AS IDENTITY                                 | 主キー                                                                                                                                                                                                                                                      |
| target_month | date                     | NOT NULL, CHECK (月初日であること)                                        | 対象月（月初日で格納: 例 2026-10-01。recurring_costs と同方式）                                                                                                                                                                                             |
| team         | text                     | NOT NULL                                                                  | 対象チーム（select_options の team と同じ値域）                                                                                                                                                                                                             |
| declared_by  | bigint                   | NOT NULL, FOREIGN KEY (profiles.id)（参照アクション指定なし = NO ACTION） | 申告者（最終更新したチームリーダー等）。extra_entries.manager_id と同じく CASCADE にしない（リーダーの退会でチームの申告ごと消えるのを避ける）。申告のある profiles を削除するとこの FK でエラーになるため、先に declared_by を別のメンバーに付け替えること |
| comment      | text                     | NULL                                                                      | 補足コメント                                                                                                                                                                                                                                                |
| inserted_at  | timestamp with time zone | NOT NULL, DEFAULT now()                                                   | 作成日時                                                                                                                                                                                                                                                    |
| updated_at   | timestamp with time zone | NOT NULL, DEFAULT now()                                                   | 更新日時                                                                                                                                                                                                                                                    |

CHECK 制約（対象月の正規化）:

```sql
-- 月初日以外を弾く。これが無いと 2026-10-01 と 2026-10-05 が別行として登録でき、
-- 下の UNIQUE (target_month, team) が「1 チーム × 1 対象月」を担保できない
CHECK (target_month = date_trunc('month', target_month)::date)
```

UNIQUE 制約:

- `(target_month, team)`（`budget_declarations_target_month_team_key`）

インデックス:

- team
- declared_by（FK 側の索引。extra_entries.manager_id と同じ方針）
- （target_month 単独のインデックスは張らない。UNIQUE 制約のインデックスが `(target_month, team)` で target_month を先頭列に持つため、対象月での絞り込みはそちらが使える）

### 3.10 budget_declaration_items テーブル

事前収支申告の明細。1 ヘッダに対して収入・支出の内訳を複数行持つ。

| カラム名       | データ型                 | 制約                                                             | 説明                                                                    |
| -------------- | ------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| id             | bigint                   | PRIMARY KEY, GENERATED ALWAYS AS IDENTITY                        | 主キー                                                                  |
| declaration_id | bigint                   | NOT NULL, FOREIGN KEY (budget_declarations.id) ON DELETE CASCADE | 申告ヘッダ ID（ヘッダ削除時に明細も削除される）                         |
| entry_type     | text                     | NOT NULL, CHECK (entry_type IN ('income', 'expense'))            | 種別（income = 収入 / expense = 支出。extra_entries と同じ値域）        |
| category       | text                     | NOT NULL                                                         | 分類（収入時は案件分類 category、支出時は品目 item マスタの値域を想定） |
| description    | text                     | NOT NULL                                                         | 内容（例: ○○受託案件、外注費）                                          |
| amount         | numeric(15,2)            | NOT NULL, CHECK (amount > 0)                                     | 見込み金額（円・税別。正の値のみ）                                      |
| display_order  | integer                  | NOT NULL, DEFAULT 0                                              | 表示順                                                                  |
| inserted_at    | timestamp with time zone | NOT NULL, DEFAULT now()                                          | 作成日時                                                                |
| updated_at     | timestamp with time zone | NOT NULL, DEFAULT now()                                          | 更新日時                                                                |

インデックス:

- declaration_id

## 4. 列挙型

### 4.1 information_category

情報カテゴリの列挙型

| 値            | 説明       |
| ------------- | ---------- |
| basic_info    | 基本情報   |
| business_info | 取引先情報 |
| cost_info     | コスト情報 |

## 5. Row Level Security (RLS)

### 5.0 テーブル / シーケンス権限（PostgREST の前提）

RLS は行スコープのゲートであり、テーブルに対する `GRANT SELECT / INSERT / UPDATE / DELETE` が無いと PostgREST は RLS を評価する前に HTTP 403 を返す。

現行のローカル Supabase Postgres イメージは `public` スキーマの DEFAULT PRIVILEGES が厳格化されており、マイグレーションの `CREATE TABLE` だけでは `anon` / `authenticated` / `service_role` に CRUD が付かない（付くのは `TRUNCATE` / `REFERENCES` / `TRIGGER` / `MAINTAIN` のみ）。`supabase/migrations/20260826000000_17_grant_public_crud.sql` で標準的なテーブル / シーケンス GRANT と DEFAULT PRIVILEGES を明示する。関数の `EXECUTE` は付与しない（migration 15/16 の `custom_access_token_hook` 制限を維持する）。

`supabase db reset` はこのマイグレーションを含めて再適用するため、リセット後も PostgREST が 403 に戻らない。

migration 17 以降に追加するテーブルは、同マイグレーションの `ALTER DEFAULT PRIVILEGES` で自動的に同じ権限が付くが、DEFAULT PRIVILEGES の設定差で 403 に戻らないよう、新規テーブルのマイグレーション内でも `GRANT` を明示する（例: `20260830050000_19_budget_declarations.sql`）。

### 5.1 profiles テーブル

> パフォーマンス最適化のため、`auth.uid()` は `(select auth.uid())` でラップして 1 行ごとの再評価を避けている（Supabase Linter `auth_rls_initplan` 対応）。

> SELECT は「自分 / 経理・管理者 / 同チームのチームリーダー」に限定している（旧 `USING (true)` では全ログインユーザーが他人の email・class 等を読めたため）。閲覧者自身の `class` / `team` を SELECT ポリシー内で参照すると profiles への再帰参照で無限再帰になるため、`SECURITY DEFINER` のヘルパ関数（`auth_user_class()` / `auth_user_team()`、RLS をバイパスして自分の 1 行のみ読む）経由で取得する。

```sql
-- 閲覧者自身の class / team を RLS バイパスで取得するヘルパ（再帰回避用）
CREATE OR REPLACE FUNCTION public.auth_user_class()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $$ SELECT class FROM public.profiles WHERE user_id = (select auth.uid()) LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.auth_user_team()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $$ SELECT team FROM public.profiles WHERE user_id = (select auth.uid()) LIMIT 1 $$;

-- ヘルパ関数は認証済みロールのみ実行可能（不特定多数からの直接呼び出しを防ぐ）
REVOKE EXECUTE ON FUNCTION public.auth_user_class() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_user_team() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_class() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_team() TO authenticated;

-- 自分 / 経理・管理者 / 同チームのチームリーダーのみ参照可能
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.auth_user_class() IN ('admin', 'accounting')
    OR (
      public.auth_user_class() = 'teamleader'
      AND public.auth_user_team() IS NOT NULL
      AND profiles.team = public.auth_user_team()
    )
  );

-- 自分自身のプロフィールのみ挿入可能
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- 自分自身のプロフィールまたは管理者が更新可能。
-- WITH CHECK で更新後の値も制約し、admin 以外による class/team/user_id の改変
-- （自己昇格・所有者付け替え）を防ぐ。
CREATE POLICY "Users can update own profile or admin can update any profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.auth_user_class() = 'admin'
  )
  WITH CHECK (
    public.auth_user_class() = 'admin'
    OR (
      user_id = (select auth.uid())
      AND class IS NOT DISTINCT FROM public.auth_user_class()
      AND team  IS NOT DISTINCT FROM public.auth_user_team()
    )
  );
```

### 5.2 matters テーブル

```sql
-- 自身の案件または経理担当者/管理者/同チームのチームリーダーが参照可能
CREATE POLICY "matters_select_policy" ON matters
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = matters.user_id
            AND profiles.user_id = (select auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class = 'teamleader'
            AND profiles.team IS NOT NULL
            AND profiles.team = matters.team
        )
    );

-- 自身の案件のみ挿入可能
CREATE POLICY "matters_insert_policy" ON matters
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = matters.user_id
            AND profiles.user_id = (select auth.uid())
        )
    );

-- 自身の案件または経理担当者/管理者が更新可能
-- 経理申請済の案件も編集可能にする（has_updatesフラグを設定）
CREATE POLICY "matters_update_policy" ON matters
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = matters.user_id
            AND profiles.user_id = (select auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        )
    );

-- 自身の案件または管理者が削除可能
CREATE POLICY "matters_delete_policy" ON matters
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = matters.user_id
            AND profiles.user_id = (select auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class = 'admin'
        )
    );
```

### 5.3 costs テーブル

```sql
-- 自身の案件に関連するコスト、同チームのチームリーダー、または経理担当者/管理者が参照可能
CREATE POLICY "costs_select_policy" ON costs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM matters
            JOIN profiles ON profiles.id = matters.user_id
            WHERE matters.id = costs.matter_id
            AND profiles.user_id = (select auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        ) OR
        EXISTS (
            SELECT 1 FROM profiles cu, matters
            WHERE matters.id = costs.matter_id
            AND cu.user_id = (select auth.uid())
            AND cu.class = 'teamleader'
            AND cu.team IS NOT NULL
            AND cu.team = matters.team
        )
    );

-- 自身の案件に関連するコストのみ挿入可能
CREATE POLICY "costs_insert_policy" ON costs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM matters
            JOIN profiles ON profiles.id = matters.user_id
            WHERE matters.id = costs.matter_id
            AND profiles.user_id = (select auth.uid())
        )
    );

-- 自身の案件に関連するコストまたは経理担当者/管理者が更新可能
CREATE POLICY "costs_update_policy" ON costs
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM matters
            JOIN profiles ON profiles.id = matters.user_id
            WHERE matters.id = costs.matter_id
            AND profiles.user_id = (select auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        )
    );

-- 自身の案件に関連するコストまたは管理者が削除可能
CREATE POLICY "costs_delete_policy" ON costs
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM matters
            JOIN profiles ON profiles.id = matters.user_id
            WHERE matters.id = costs.matter_id
            AND profiles.user_id = (select auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class = 'admin'
        )
    );
```

### 5.4 business テーブル

```sql
-- 自身の案件に関連する取引先、同チームのチームリーダー、または経理担当者/管理者が参照可能
CREATE POLICY "business_select_policy" ON business
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM matters
            JOIN profiles ON profiles.id = matters.user_id
            WHERE matters.id = business.matter_id
            AND profiles.user_id = (select auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        ) OR
        EXISTS (
            SELECT 1 FROM profiles cu, matters
            WHERE matters.id = business.matter_id
            AND cu.user_id = (select auth.uid())
            AND cu.class = 'teamleader'
            AND cu.team IS NOT NULL
            AND cu.team = matters.team
        )
    );

-- 自身の案件に関連する取引先のみ挿入可能
CREATE POLICY "business_insert_policy" ON business
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM matters
            JOIN profiles ON profiles.id = matters.user_id
            WHERE matters.id = business.matter_id
            AND profiles.user_id = (select auth.uid())
        )
    );

-- 自身の案件に関連する取引先または経理担当者/管理者が更新可能
CREATE POLICY "business_update_policy" ON business
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM matters
            JOIN profiles ON profiles.id = matters.user_id
            WHERE matters.id = business.matter_id
            AND profiles.user_id = (select auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        )
    );

-- 自身の案件に関連する取引先または管理者が削除可能
CREATE POLICY "business_delete_policy" ON business
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM matters
            JOIN profiles ON profiles.id = matters.user_id
            WHERE matters.id = business.matter_id
            AND profiles.user_id = (select auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class = 'admin'
        )
    );
```

### 5.5 select_option_types テーブル・select_options テーブル

> 管理者向け書き込みポリシーは `FOR ALL` ではなく `INSERT/UPDATE/DELETE` を個別に定義する。`FOR ALL` だと SELECT も対象となり、参照用ポリシーと重複して Supabase Linter `multiple_permissive_policies` が発火するため。

```sql
-- 全認証ユーザーが参照可能
CREATE POLICY "Users can view select option types" ON select_option_types
    FOR SELECT USING (true);

CREATE POLICY "Users can view select options" ON select_options
    FOR SELECT USING (true);

-- 管理者のみ書き込み可能（select_option_types）
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

-- 管理者のみ書き込み可能（select_options）
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
```

### 5.6 recurring_costs テーブル

> teamleader が全体共通（team IS NULL）の行を SELECT できるのは、損益計算書で「全体共通（参考）」として表示するため。チーム損益への算入可否はアプリケーション層で制御する。

```sql
-- 経理担当者/管理者は全行、チームリーダーは自チームの行 + 全体共通の行を参照可能
CREATE POLICY "recurring_costs_select_policy" ON recurring_costs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class = 'teamleader'
            AND profiles.team IS NOT NULL
            AND (recurring_costs.team IS NULL OR recurring_costs.team = profiles.team)
        )
    );

-- 経理担当者/管理者のみ挿入可能
CREATE POLICY "recurring_costs_insert_policy" ON recurring_costs
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        )
    );

-- 経理担当者/管理者のみ更新可能
CREATE POLICY "recurring_costs_update_policy" ON recurring_costs
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        )
    );

-- 経理担当者/管理者のみ削除可能
CREATE POLICY "recurring_costs_delete_policy" ON recurring_costs
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        )
    );
```

### 5.7 extra_entries テーブル

> recurring_costs と同じ方針。teamleader が全体共通（team IS NULL）の行を SELECT できるのは、損益計算書で「全体共通（参考）」として表示するため。チーム損益への算入可否はアプリケーション層で制御する。書き込みは経理担当者・管理者のみ。

```sql
-- 経理担当者/管理者は全行、チームリーダーは自チームの行 + 全体共通の行を参照可能
CREATE POLICY "extra_entries_select_policy" ON extra_entries
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        ) OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class = 'teamleader'
            AND profiles.team IS NOT NULL
            AND (extra_entries.team IS NULL OR extra_entries.team = profiles.team)
        )
    );

-- 経理担当者/管理者のみ挿入可能
CREATE POLICY "extra_entries_insert_policy" ON extra_entries
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        )
    );

-- 経理担当者/管理者のみ更新可能
CREATE POLICY "extra_entries_update_policy" ON extra_entries
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        )
    );

-- 経理担当者/管理者のみ削除可能
CREATE POLICY "extra_entries_delete_policy" ON extra_entries
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = (select auth.uid())
            AND profiles.class IN ('admin', 'accounting')
        )
    );
```

### 5.8 budget_declarations テーブル

> recurring_costs / extra_entries と異なり、**チームリーダーに自チーム分の書き込みを許可する**（事前収支申告はチームリーダー自身が入力するため）。経理担当者・管理者は全行、チームリーダーは自チームの行のみ SELECT / INSERT / UPDATE / DELETE でき、public ロールはアクセスできない。UPDATE は `WITH CHECK` でも team を制約し、他チームへの付け替えを防ぐ。
>
> 判定には `EXISTS (SELECT ... FROM profiles ...)` ではなく `SECURITY DEFINER` ヘルパ関数 `auth_user_class()` / `auth_user_team()`（[5.1](#51-profiles-テーブル) 参照）を使う。profiles の SELECT ポリシー自体に依存しないため、閲覧できる profiles の行が絞られていても判定がぶれない。
>
> さらに **INSERT の `WITH CHECK` に限り**、チームリーダーには `declared_by` = 自分自身の profiles.id を強制する（他人名義での新規申告の防止）。経理担当者・管理者は代理入力があるため制約しない。ここだけは profiles を直接参照するが、参照するのは自分自身の行のみで、profiles の SELECT ポリシーは自分の行を常に許可するため阻まれない。
>
> UPDATE / DELETE には `declared_by` の制約を課さない。明細（budget_declaration_items）の書き込みは親ヘッダの team だけで判定するため、チームリーダーは `declared_by` に触れずに金額を全部書き換えられる。UPDATE だけを縛っても「`declared_by` = 実際に最後に手を入れた人」は DB では保証できない一方、既存行を読んでそのまま書き戻す一般的な更新パターン（元の `declared_by` を送る）が 42501 になり、同一チームの別リーダーや経理が作成した行を編集できなくなる。したがって `declared_by` は「アプリが最終更新者で更新する表示・監査補助用の項目」と位置づけ、DB では INSERT 時の詐称防止のみを担保する。

```sql
-- 経理担当者/管理者は全行、チームリーダーは自チームの行のみ参照可能
CREATE POLICY "budget_declarations_select_policy" ON budget_declarations
    FOR SELECT TO authenticated
    USING (
        public.auth_user_class() IN ('admin', 'accounting')
        OR (
            public.auth_user_class() = 'teamleader'
            AND public.auth_user_team() IS NOT NULL
            AND budget_declarations.team = public.auth_user_team()
        )
    );

CREATE POLICY "budget_declarations_delete_policy" ON budget_declarations
    FOR DELETE TO authenticated
    USING ( /* SELECT と同条件 */ );

-- INSERT の WITH CHECK のみ、チームリーダーに declared_by = 自分自身も強制する
CREATE POLICY "budget_declarations_insert_policy" ON budget_declarations
    FOR INSERT TO authenticated
    WITH CHECK (
        public.auth_user_class() IN ('admin', 'accounting')
        OR (
            public.auth_user_class() = 'teamleader'
            AND public.auth_user_team() IS NOT NULL
            AND budget_declarations.team = public.auth_user_team()
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = budget_declarations.declared_by
                AND p.user_id = (select auth.uid())
            )
        )
    );

-- UPDATE は USING と WITH CHECK の双方に SELECT と同条件を課し、他チームへの team 付け替えを防ぐ
CREATE POLICY "budget_declarations_update_policy" ON budget_declarations
    FOR UPDATE TO authenticated
    USING ( /* SELECT と同条件 */ )
    WITH CHECK ( /* SELECT と同条件。declared_by は制約しない */ );
```

### 5.9 budget_declaration_items テーブル

> 明細は親ヘッダ（budget_declarations）への `EXISTS` で 5.8 と同じ条件を適用する（costs → matters の JOIN パターンと同様）。UPDATE は `WITH CHECK` でも親ヘッダを制約し、他チームの申告への付け替えを防ぐ。

```sql
-- SELECT / INSERT / UPDATE / DELETE すべて、親ヘッダが 5.8 の条件を満たす行のみ
CREATE POLICY "budget_declaration_items_select_policy" ON budget_declaration_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM budget_declarations d
            WHERE d.id = budget_declaration_items.declaration_id
            AND (
                public.auth_user_class() IN ('admin', 'accounting')
                OR (
                    public.auth_user_class() = 'teamleader'
                    AND public.auth_user_team() IS NOT NULL
                    AND d.team = public.auth_user_team()
                )
            )
        )
    );

-- insert / update / delete ポリシーも同じ EXISTS 条件
-- （UPDATE は USING と WITH CHECK の双方に課す）
```

## 6. トリガー

### 6.1 updated_at 更新トリガー

全テーブルに対して、更新時に updated_at カラムを現在時刻で更新するトリガーを設定。

`now()` はセッション TZ に依存せず `timestamptz` をそのまま返す（[1.3](#13-タイムゾーン方針) 参照）。`search_path = ''` は `20260523053903_07_harden_function_search_path.sql` で設定したもので、`CREATE OR REPLACE FUNCTION` は SET 句を含む関数属性も置き換えるため定義側で明示する。

```sql
-- 更新時のタイムスタンプ更新関数
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

-- テーブルごとのトリガー設定
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_matters_updated_at
    BEFORE UPDATE ON matters
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_costs_updated_at
    BEFORE UPDATE ON costs
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_business_updated_at
    BEFORE UPDATE ON business
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_recurring_costs_updated_at
    BEFORE UPDATE ON recurring_costs
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_extra_entries_updated_at
    BEFORE UPDATE ON extra_entries
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_budget_declarations_updated_at
    BEFORE UPDATE ON budget_declarations
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_budget_declaration_items_updated_at
    BEFORE UPDATE ON budget_declaration_items
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
```

### 6.2 案件更新検知トリガー

経理申請済み案件が更新された場合に、has_updates フラグを true に設定するトリガー

```sql
-- 案件更新検知関数
CREATE OR REPLACE FUNCTION detect_matter_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- 経理申請済みで、かつ経理確認未完了の案件が更新された場合
    IF OLD.is_fixed = TRUE AND NEW.is_fixed = TRUE AND NEW.is_completed = FALSE THEN
        -- 更新フラグをONにする
        NEW.has_updates = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガー設定
CREATE TRIGGER detect_matters_updates
    BEFORE UPDATE ON matters
    FOR EACH ROW
    EXECUTE PROCEDURE detect_matter_updates();
```

### 6.3 売上金額チェックトリガー

経理申請時に売上金額が 0 の場合に警告を表示するトリガー（アプリケーション側で実装）

```sql
-- この機能はアプリケーション側で実装
-- データベース側ではトリガーではなく、アプリケーションロジックで対応
```

## 7. 認証フック（Custom Access Token Hook）

`public.custom_access_token_hook(event jsonb)` は Supabase Auth がトークン発行/リフレッシュ時に呼び出すフック関数。`profiles.class` を JWT の `user_class` クレームに載せ、`middleware.ts` が制限ルートでのロール判定を DB クエリなし（JWT から直接読む）で行えるようにする。

現在の定義（migration 15 を migration 16 で是正したもの）:

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  user_class text;
BEGIN
  SELECT class INTO user_class
  FROM public.profiles
  WHERE user_id = (event->>'user_id')::uuid;

  claims := COALESCE(event->'claims', '{}'::jsonb);

  -- claims キーが JSON null / 配列など object 以外の場合、jsonb_set は
  -- "cannot set path in scalar" で例外を投げる（COALESCE は SQL NULL しか
  -- 救えないため別ガードが必要）。空オブジェクトにリセットすると sub / exp / role 等の
  -- 既存クレームを破棄した event を返すことになるため、クレーム付与を諦めて
  -- event をそのまま返す（EXCEPTION 節と同じフェイルセーフ方針）。
  IF jsonb_typeof(claims) IS DISTINCT FROM 'object' THEN
    RAISE WARNING 'custom_access_token_hook: claims is not an object (%) for user_id=%, skipping',
      jsonb_typeof(claims), event->>'user_id';
    RETURN event;
  END IF;

  claims := jsonb_set(claims, '{user_class}', COALESCE(to_jsonb(user_class), 'null'::jsonb));

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
EXCEPTION WHEN OTHERS THEN
  -- user_id が uuid として不正な形式、権限ドリフトによる SELECT 権限不足など、
  -- 想定外の要因も含めて全て捕捉し、クレーム付与を諦めて event をそのまま返す
  -- （フェイルセーフ。トークン発行自体は失敗させない）。
  RAISE WARNING 'custom_access_token_hook failed for user_id=%: % (SQLSTATE %)',
    event->>'user_id', SQLERRM, SQLSTATE;
  RETURN event;
END;
$$;

-- 実行はフック呼び出し元の supabase_auth_admin のみに許可する
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, authenticated, anon;

-- フック関数が profiles.class を読めるよう、supabase_auth_admin 向けの SELECT ポリシーを追加
CREATE POLICY "Auth admin can read profile class for token hook"
  ON public.profiles AS PERMISSIVE FOR SELECT
  TO supabase_auth_admin USING (true);

-- フックが実際に必要とするのは user_id / class の 2 列のみ。
-- テーブル全体への SELECT ではなく列単位の GRANT に絞り、email / slack_id / team
-- （migration 12 で一般ユーザーからの参照を制限した PII 列）を supabase_auth_admin から
-- も読めない状態に保つ（RLS の USING(true) は行スコープの制御であり、列スコープは
-- 別途この列単位 GRANT で絞る必要がある）。
GRANT SELECT (user_id, class) ON TABLE public.profiles TO supabase_auth_admin;
```

**有効化**:

- ローカル: `supabase/config.toml` の `[auth.hook.custom_access_token]`（`enabled = true` / `uri = "pg-functions://postgres/public/custom_access_token_hook"`）。フックは関数の存在を前提とするため、このブランチを pull した後は `supabase stop && supabase start` の再起動だけでなく **`supabase db reset` を実行してマイグレーションを適用すること**。関数が無い状態でフックが有効だとトークン発行自体が失敗し、全ユーザーがログインできなくなる。
- 本番: Supabase ダッシュボード（Authentication > Hooks）で「Custom Access Token」に `public.custom_access_token_hook` を設定する（**手動対応が必要**）。マイグレーション適用前に有効化すると同様にログイン不能になるため、マイグレーション適用後に有効化すること。

**注意点**:

- `class` を変更しても、対象ユーザーのトークンがリフレッシュ（既定で最大約 1 時間）または再ログインするまで JWT に反映されない。制限ルートの `middleware.ts` によるゲーティングはこの遅延を許容する仕様とし、即時反映が必要な用途では別途対応すること。
- `middleware.ts` は `user_class` クレームが有効な文字列でない場合（クレームキー自体が無い / 値が明示的に `null` / 空文字 / 文字列以外）は `profiles` への DB クエリにフォールバックする（フェイルセーフ）。`app/auth/callback/route.ts` はトークン発行（フック実行）の**後**に profiles 行を作成するため、新規ユーザーの初回トークンは必ず `user_class: null` になる。この場合もフォールバックすることで、直後の管理者によるロール付与を最大約 1 時間待たずに反映できる。
- `middleware.ts` は `getUser()`（Supabase Auth サーバでの署名検証を伴う）で認証済みかどうかを判定したうえで、同じアクセストークンから `user_class` クレームを読む。`getSession()` はローカル Cookie を読むだけで署名検証を行わないため、認証の可否判定には使わない。`getUser()` が Supabase Auth 側の一時的障害を返した場合は、ログイン中ユーザーを一律 `/login` に飛ばさず 503 を返す（一時的障害と不正トークンを区別する）。判定は「`AuthRetryableFetchError`（fetch 自体の失敗と 502/503/504）**または** ステータス 5xx の `AuthApiError`」で行う。auth-js が `AuthRetryableFetchError` にするのは 502/503/504 のみで 500 は `AuthApiError` になるため、後者を含めないと Auth の 500 で全ユーザーが強制ログアウトされる。偽造・期限切れトークンは 401/403 になるためこの判定には混入しない。

## 8. ER 図

```mermaid
erDiagram
    profiles ||--o{ matters : "creates"
    profiles ||--o{ extra_entries : "manages"
    profiles ||--o{ budget_declarations : "declares"
    budget_declarations ||--o{ budget_declaration_items : "contains"
    matters ||--o{ costs : "contains"
    matters ||--o{ business : "has"
    matters ||--o{ matters : "is parent of"
    select_option_types ||--o{ select_options : "has"

    profiles {
        bigint id PK
        uuid user_id FK
        text email
        text name
        text slack_id
        text class
        text team
        timestamp inserted_at
        timestamp updated_at
    }

    matters {
        bigint id PK
        text title
        text category
        text team
        text description
        date start_date
        boolean is_fixed
        boolean is_completed
        boolean has_updates
        numeric total_cost
        integer cost_count
        numeric total_amount
        integer business_count
        text accounting_memo
        integer unchecked_cost_count
        bigint user_id FK
        bigint parent_matter_id FK
        timestamp inserted_at
        timestamp updated_at
    }

    costs {
        bigint id PK
        text name
        text item
        text payment_target
        numeric price
        date period
        text certificate
        boolean withholding
        boolean is_completed
        text comment
        bigint matter_id FK
        timestamp inserted_at
        timestamp updated_at
    }

    business {
        bigint id PK
        text name
        date invoice_date
        date period_date
        numeric amount
        boolean is_completed
        bigint matter_id FK
        timestamp inserted_at
        timestamp updated_at
    }

    select_option_types {
        uuid id PK
        varchar name
        varchar display_name
        enum category
        text description
        integer display_order
        timestamp created_at
        timestamp updated_at
    }

    select_options {
        serial id PK
        uuid type_id FK
        varchar value
        integer display_order
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    recurring_costs {
        bigint id PK
        text name
        text item
        numeric price
        text team
        text payment_cycle
        date start_month
        date end_month
        text comment
        timestamp inserted_at
        timestamp updated_at
    }

    extra_entries {
        bigint id PK
        text entry_type
        text category
        date entry_date
        text invoice_number
        text description
        text billing_target
        bigint manager_id FK
        text team
        numeric billing_amount
        numeric expense_amount
        text payment_method
        timestamp inserted_at
        timestamp updated_at
    }

    budget_declarations {
        bigint id PK
        date target_month
        text team
        bigint declared_by FK
        text comment
        timestamp inserted_at
        timestamp updated_at
    }

    budget_declaration_items {
        bigint id PK
        bigint declaration_id FK
        text entry_type
        text category
        text description
        numeric amount
        integer display_order
        timestamp inserted_at
        timestamp updated_at
    }
```

## 9. 初期データ

### 9.1 選択肢マスタ

```sql
-- 選択肢の種類
INSERT INTO select_option_types (name, display_name, category, display_order) VALUES
    ('team', 'チーム', 'basic_info', 1),
    ('category', '分類', 'basic_info', 2),
    ('item', '品目', 'cost_info', 1),
    ('certificate', '通知方法', 'cost_info', 2),
    ('extra_income_category', '収入分類', 'business_info', 1),
    ('extra_expense_category', '支出分類', 'cost_info', 3),
    ('payment_method', '決済方法', 'cost_info', 4);

-- チーム選択肢
INSERT INTO select_options (type_id, value, display_order) VALUES
    ((SELECT id FROM select_option_types WHERE name = 'team'), 'シンラボ', 1),
    ((SELECT id FROM select_option_types WHERE name = 'team'), 'SDGs', 2),
    ((SELECT id FROM select_option_types WHERE name = 'team'), '広報', 3),
    ((SELECT id FROM select_option_types WHERE name = 'team'), 'AI事業創出', 4),
    ((SELECT id FROM select_option_types WHERE name = 'team'), 'ハロスク', 5),
    ((SELECT id FROM select_option_types WHERE name = 'team'), '事務局', 6);

-- 案件分類選択肢
INSERT INTO select_options (type_id, value, display_order) VALUES
    ((SELECT id FROM select_option_types WHERE name = 'category'), '会員費', 1),
    ((SELECT id FROM select_option_types WHERE name = 'category'), '受託案件', 2),
    ((SELECT id FROM select_option_types WHERE name = 'category'), '認定ファシリ', 3),
    ((SELECT id FROM select_option_types WHERE name = 'category'), '研修・検定', 4),
    ((SELECT id FROM select_option_types WHERE name = 'category'), 'ボードゲーム', 5),
    ((SELECT id FROM select_option_types WHERE name = 'category'), 'イベント', 6),
    ((SELECT id FROM select_option_types WHERE name = 'category'), 'ハロスク', 7),
    ((SELECT id FROM select_option_types WHERE name = 'category'), 'その他', 8);

-- 費目選択肢
INSERT INTO select_options (type_id, value, display_order) VALUES
    ((SELECT id FROM select_option_types WHERE name = 'item'), 'システム料', 1),
    ((SELECT id FROM select_option_types WHERE name = 'item'), '施設利用料', 2),
    ((SELECT id FROM select_option_types WHERE name = 'item'), '外注費', 3),
    ((SELECT id FROM select_option_types WHERE name = 'item'), '備品購入', 4),
    ((SELECT id FROM select_option_types WHERE name = 'item'), 'メンバー報酬', 5),
    ((SELECT id FROM select_option_types WHERE name = 'item'), 'シンラボ活動費', 6),
    ((SELECT id FROM select_option_types WHERE name = 'item'), '広告宣伝費', 7),
    ((SELECT id FROM select_option_types WHERE name = 'item'), '教育・研修', 8),
    ((SELECT id FROM select_option_types WHERE name = 'item'), '営業費', 9),
    ((SELECT id FROM select_option_types WHERE name = 'item'), 'その他', 10);

-- 証憑選択肢
INSERT INTO select_options (type_id, value, display_order) VALUES
    ((SELECT id FROM select_option_types WHERE name = 'certificate'), '請求書', 1),
    ((SELECT id FROM select_option_types WHERE name = 'certificate'), '領収書', 2);

-- 収入分類選択肢（経理追加収支用。暫定値のため管理画面で実運用に合わせて編集する）
INSERT INTO select_options (type_id, value, display_order) VALUES
    ((SELECT id FROM select_option_types WHERE name = 'extra_income_category'), '協賛金', 1),
    ((SELECT id FROM select_option_types WHERE name = 'extra_income_category'), '助成金', 2),
    ((SELECT id FROM select_option_types WHERE name = 'extra_income_category'), '受託収入', 3),
    ((SELECT id FROM select_option_types WHERE name = 'extra_income_category'), 'その他収入', 4);

-- 支出分類選択肢（経理追加収支用。暫定値のため管理画面で実運用に合わせて編集する）
INSERT INTO select_options (type_id, value, display_order) VALUES
    ((SELECT id FROM select_option_types WHERE name = 'extra_expense_category'), '消耗品費', 1),
    ((SELECT id FROM select_option_types WHERE name = 'extra_expense_category'), '交通費', 2),
    ((SELECT id FROM select_option_types WHERE name = 'extra_expense_category'), '会議費', 3),
    ((SELECT id FROM select_option_types WHERE name = 'extra_expense_category'), '通信費', 4),
    ((SELECT id FROM select_option_types WHERE name = 'extra_expense_category'), 'その他経費', 5);

-- 決済方法選択肢（経理追加収支用）
INSERT INTO select_options (type_id, value, display_order) VALUES
    ((SELECT id FROM select_option_types WHERE name = 'payment_method'), '銀行振込', 1),
    ((SELECT id FROM select_option_types WHERE name = 'payment_method'), 'クレジットカード', 2),
    ((SELECT id FROM select_option_types WHERE name = 'payment_method'), '口座引き落とし', 3),
    ((SELECT id FROM select_option_types WHERE name = 'payment_method'), '現金', 4);
```
