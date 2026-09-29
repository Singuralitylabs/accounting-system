# 本番リリース手順

本番リリース（`main` → `release`）の手順書。差分調査・リリース PR 作成・タグ作成は GitHub Actions で半自動化している（Issue #143）。`db push`（本番 DB へのマイグレーション適用）は自動化しない。

## 運用の前提

- `release` への反映は必ず `main` を経由する。作業ブランチから `release` へ直接 PR を作らない。本番ホットフィックスも `main` に入れてからカットする（`release` のツリーは常に `main` のある時点と一致する）。
- `release` へのマージは merge commit で行う（Squash / Rebase 禁止）。`create-release.yml` が親数で検証する。
- PR のマージはユーザーのみが行う（エージェントは実行しない）。
- タグ命名は `REL-TAG-X.Y.Z` を継続する（既存: `REL-TAG-1.0.0`〜`REL-TAG-3.2.0`）。
- リリース PR は Draft で作成する（マイグレーション適用前の誤マージ防止）。

## 自動化の範囲

| 工程                             | 自動 / 手動                                  |
| -------------------------------- | -------------------------------------------- |
| 差分検出・リリース PR 作成       | 自動（`release-pr.yml` を手動起動）          |
| 本番 DB へのマイグレーション適用 | **手動**（`supabase db push`。自動化しない） |
| Exposed schemas 確認・マージ     | 手動                                         |
| Vercel 本番デプロイ              | 自動（`release` へのマージで発火）           |
| 本番動作確認 → 承認              | 手動（Environment の承認）                   |
| タグ作成・GitHub Release 公開    | 自動（承認後）                               |

ワークフローが本番 DB へ書き込むことはない（`db push` を含まない）。`release-pr.yml` の DB アクセスは `supabase migration list` の読み取り専用のみである。

## 事前準備（管理者作業・初回のみ）

GitHub の **Settings > Environments** で以下を設定する。

- Environment `production-release` に **Required reviewers** を設定する（本番動作確認を終えた人が承認する）。未設定だと `create-release.yml` がフェイルオープン防止のため失敗する。
- Environment `production-db-readonly` に Secret `SUPABASE_READONLY_DB_URL`（読み取り専用ロールの Session pooler 接続文字列。**パスワードを含めない**）と `SUPABASE_READONLY_DB_PASSWORD`（そのパスワード）を登録する（任意）。作り方は下記「読み取り専用ロール」。未設定・形式不正・DB Pause 時はリリース PR 本文に「手元で確認」の案内が出る（失敗にはならない）。

### 読み取り専用ロール（`migration_reader`）

`release-pr.yml` が本番の `migration list` を読むための専用ロール。ロールと権限は migration 36（`supabase/migrations/20260929000000_36_migration_reader_role.sql`、`docs/database.md` 5.16）で作る（`supabase_migrations.schema_migrations` の SELECT のみ。接続情報が漏れても業務データは読めない）。パスワードだけはマイグレーションに書かず、手動で設定する。

1. 先に migration 36 を本番に適用してロールを作っておく（新しい環境の場合。`\password` はロールが存在しないと失敗する）。そのうえで、手元の `psql`（`postgres` ロールで本番に接続）から `\password migration_reader` でパスワードを設定する。`\password` はクライアント側で SCRAM-SHA-256 のハッシュにしてから送るため、平文が SQL Editor の履歴や Postgres のログに残らない（SQL Editor で `ALTER ROLE ... PASSWORD '<平文>'` を実行しない。やむを得ず実行した場合は、実行後に SQL Editor の該当クエリ・スニペットを削除する）。パスワードは `openssl rand -hex 32` で作る（英数字だけにして、エスケープやシェル展開の問題を避ける）。
2. ダッシュボードの **Connect > Session pooler** に表示される接続文字列をコピーし、ユーザー部分を `migration_reader.<project-ref>` に置き換え、`:[YOUR-PASSWORD]` の部分を**削除**する（`postgresql://migration_reader.<project-ref>@<pooler のホスト>:5432/postgres`。pooler のホスト名は `aws-0-...` / `aws-1-...` などプロジェクトによって異なるため、手で組み立てない）。これを `SUPABASE_READONLY_DB_URL` に、パスワードを `SUPABASE_READONLY_DB_PASSWORD` に登録する。

- パスワードを URL と分けるのは、コマンドライン（argv）に載せないため。ワークフローはパスワードを環境変数 `PGPASSWORD` で CLI に渡す。URL にパスワードが含まれている（`://ユーザー:パスワード@` の形）場合は CLI を実行せず「形式が不正」の案内を出す（Issue #195）。
- 業務テーブルが読める権限（`pg_read_all_data` への所属、`BYPASSRLS` など）を付けないこと。付与状況は `pg_roles` / `pg_auth_members` / `information_schema.role_table_grants` で確認できる。
- 手元でこのロールを使って確認するときも、パスワードは URL に入れず `PGPASSWORD` で渡す。`yarn supabase ...` は使わない（yarn v1 がコマンド行を表示する）。

  ```bash
  read -rs PGPASSWORD && export PGPASSWORD   # パスワードを入力（画面・シェル履歴に残らない）
  npx supabase migration list --db-url "postgresql://migration_reader.<project-ref>@<pooler のホスト>:5432/postgres"
  unset PGPASSWORD
  ```

#### パスワードのローテーション（漏洩時・定期）

1. `openssl rand -hex 32` で新しいパスワードを作る。
2. 手元の `psql`（`postgres` ロールで本番に接続）から `\password migration_reader` で新しいパスワードを設定する（上記 1 と同じく SQL Editor に平文を書かない）。続けて `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'migration_reader';` で既存の接続を切る。
3. **Settings > Environments > `production-db-readonly`** の `SUPABASE_READONLY_DB_PASSWORD` を更新する（URL 側は変わらない）。
4. 手元で新しいパスワードの `migration list` が通り、古いパスワードが `password authentication failed` になることを確認する（上記の `PGPASSWORD` の手順）。Session pooler（Supavisor）がロールの認証情報をキャッシュするため、**変更直後は新しいパスワードが拒否され、古いパスワードが通ることがある**。数分おいてから確認し直す。
5. 漏洩時は、Supabase の **Logs > Postgres** で `migration_reader` の接続元を確認する（GitHub Actions のランナーと手元以外が無いこと）。漏洩元が PR 本文などの場合は、本文から削除し、「edited」の履歴からも該当リビジョンを削除する（履歴は公開されたまま残るため、ローテーションは省略しない）。

## 手順

### 1. リリース PR を作成する

1. GitHub の **Actions > Release PR > Run workflow** を `main` ブランチから起動する（`version`: `X.Y.Z` 形式、`summary`: 任意）。
2. 品質ゲート（typecheck+lint / test / build / format-check の再利用）を通過した場合のみ、main → release の Draft PR（タイトル `リリース X.Y.Z`）が作成される。
3. 本文には以下が入る。起動前に手書きする必要はない。
   - マイグレーション一覧（`release..main` で追加）・適用済みファイルの変更/削除（別枠）
   - 後方互換でない SQL の警告（`DROP` / `ALTER COLUMN ... TYPE` / `RENAME` / トップレベルの `UPDATE`・`DELETE` / `POLICY` など。コメントと `$$` 関数本体を除外）
   - 環境変数の差分（コード側の `process.env.*`。`app/**` と `middleware.ts` が対象）
   - 本番 DB の `migration list`（または手動確認の案内）
   - マージ前チェックリスト（下記）

起動ガード（いずれも失敗する）: main 以外からの起動 / バージョン形式不正 / タグ重複（`REL-TAG-X.Y.Z`） / オープン中のリリース PR あり。既存 PR の確認は品質ゲートの前に行う。

### 2. マイグレーションを手動適用する（`db push`）

PR 本文のマイグレーション一覧と `supabase migration list` の履歴を突き合わせ、本番 Supabase に手動で適用する。

```bash
supabase link --project-ref <project-ref>
supabase migration list
supabase db push --dry-run
supabase db push
```

- アプリが新しい RPC / テーブルを参照するリリースより先に（または同時に）適用すること。未適用のままアプリだけ先行すると PostgREST は `PGRST202` を返す。
- Custom Access Token Hook の有効化はマイグレーション適用後に行うこと（該当リリースのみ。`docs/database.md` 参照）。適用前に有効化すると全ユーザーがログインできなくなる。

### 3. マージ前チェックリストを潰す

リリース PR 本文のチェックリスト（抜粋。全文は PR 本文を参照）。

- 上記マイグレーションを本番に適用済み（履歴一致を確認）
- 上記環境変数を本番（Vercel）に登録済み
- 本番 Supabase の Exposed schemas に `private` が含まれていないこと（`docs/database.md` 5.12）
- Custom Access Token Hook の有効化は適用後に行うこと（該当リリースのみ）
- 本番 DB のバックアップ（無料プランのため取得できない場合は、追加系マイグレーションに限り省略可と判断した理由を書く）
- 後方互換でない変更の有無（ある場合はリリース分割の判断済み）

### 4. マージする（merge commit）

チェックリストを潰したら Draft を Ready にし、merge commit でマージする。Squash / Rebase は禁止（`create-release.yml` が検出して失敗させる）。マージで Vercel 本番デプロイが自動で走る。

### 5. 本番動作確認後に承認する

Vercel の本番デプロイ後に動作確認し、問題がなければ `create-release.yml` の承認ゲート（Environment `production-release`）を承認する。承認されるまでタグは作られない。マージコミットの SHA はワークフロー起動時に固定されるため、承認待ちの間に `release` が進んでも付け先がずれない。タグ付け対象は同一リポジトリの `main` を head とする PR に限定される（作業ブランチ → `release` の直接 PR は `create-release.yml` が拒否する）。既存タグの再利用時は指し先が対象 SHA と一致するか承認後に再検証する。

承認後にマージコミットへ注釈付きタグ `REL-TAG-X.Y.Z` が作られ、GitHub Release が公開される（自動生成ノート + PR 本文のサマリー）。自動生成ノートの起点は直前の既存 `REL-TAG-*` タグ（無ければ全履歴）。再実行しても重複作成しない（冪等）。

### 手動実行（workflow_dispatch）はマージ後の再実行専用

`create-release.yml` の手動実行（**Actions > Create Release > Run workflow**、`version` に `X.Y.Z`）は、**リリース PR をマージした後に**、自動実行が失敗・中断したときの再実行にだけ使う。リリース PR のマージ前に実行してはならない。

- 手動実行では、その時点の `release` HEAD をタグの対象にする。そのうえで、HEAD が「リリース X.Y.Z」（`version` と同じバージョン）のマージ済み PR のマージコミットであること、その PR の head が同一リポジトリの `main` であることを検証する（`release` 向けのクローズ済み PR を API で全件取得し、マージコミットが HEAD と一致するマージ済み PR を探す。件数上限は設けていない）。条件を満たさない場合はタグを付けずに失敗する。
  - マージ前に実行すると、HEAD は前回リリースのマージコミットになる（親が 2 つあるため squash 検出は通ってしまう）。この検証が無いと、旧ツリーに新バージョンのタグが付き、マージ後の自動実行が「タグが既に別のコミットを指している」で失敗する。
- 次のリリースをマージして `release` HEAD が進んだ後は、前のバージョンを手動実行でタグ付けできない（HEAD が別の PR のマージコミットになるため）。その場合は、元の自動実行（`pull_request` イベント）を **Re-run jobs** で再実行する（マージコミットの SHA はイベントに固定されている）。
  - GitHub の Re-run は元の実行から 30 日以内しかできない。30 日を過ぎた場合は自動では付けられないため、対象のマージコミットを確認したうえでタグと Release を手動で作成する。
- 検証で特定したリリース PR の本文から、リリースサマリーを抽出する（自動実行と同じ）。

## トラブルシューティング

- `release-pr.yml` が「既存のリリース PR が open」で失敗する: 既存 PR をマージ/クローズしてから再実行する。
- `create-release.yml` が squash 検出で失敗する: release へのマージを merge commit でやり直す（PR を作り直す）。
- `create-release.yml` が承認ゲートの確認（「承認ゲートの保護ルールを確認」ステップ）で失敗する: ログの `承認ゲート確認: GET environments/production-release → HTTP <ステータス>` 行とエラーメッセージで原因を見分ける。どの場合もタグは作られない（フェイルクローズ）。
  - `HTTP 404`（「Environment 'production-release' が存在しません」）: Environment が未作成。**Settings > Environments** で `production-release` を作成し、Required reviewers を設定して再実行する。
  - `HTTP 403`（「取得が拒否されました」）: トークンの権限不足、または API のレート制限。ワークフローの `permissions` に `actions: read` があるかを確認する。ログの「API メッセージ」に GitHub の応答が出る。
  - `HTTP 200`（「Required reviewers が設定されていません」）: Environment はあるが承認者が未設定。メッセージに設定済みの保護ルール（`wait_timer` など）が出る。Required reviewers を設定して再実行する。
  - それ以外の HTTP ステータス（5xx など）や「HTTP 応答なし」: GitHub 側の一時的な障害やネットワーク障害の可能性がある。時間をおいて再実行する。
- `create-release.yml` の手動実行が「マージ済みのリリース PR のマージコミットではありません」「指定バージョン X.Y.Z のリリース PR ではありません」で失敗する: リリース PR のマージ前に実行したか、`version` が違う。リリース PR をマージしてから、正しい `version` で実行する（上記「手動実行はマージ後の再実行専用」を参照）。
- `migration list` が「自動確認できませんでした」になる: Secret 未設定、Secret の形式不正（`SUPABASE_READONLY_DB_URL` にパスワードが含まれている等。上記「読み取り専用ロール」の形に直す）、または DB Pause。手元で `npx supabase migration list`（本番プロジェクトに link 済みの状態で実行）を実行して確認する（リリース自体はブロックされない）。`--db-url` を渡す場合も `yarn supabase ...` は使わない（上記「読み取り専用ロール」参照）。
  - ローテーション直後の場合は、Session pooler のキャッシュで一時的に認証に失敗していることがある。数分おいて再実行する。
- `release-pr.yml` が「PR 本文に認証情報付きの URL が含まれている」または「migration list の出力にパスワードが含まれている」で失敗する: 本文（サマリー等の入力値を含む）や `migration list` の出力に認証情報が混入している（PR は作成されない。公開リポジトリの PR 本文は編集履歴に残るため、フェイルクローズにしている）。混入元を取り除いてから再実行する。パスワードが出力に出た場合はローテーションも行う（Issue #195）。
- タグ重複で失敗する: バージョン番号を変える。部分失敗後の再実行で同名タグが同一 SHA を指している場合は正常系として続行される。

## 既存タグの扱い

既存の `REL-TAG-*` タグに対応する GitHub Release を遡って作るかは任意とする。必要になった時点で対象バージョンのタグから手動で作成する。
