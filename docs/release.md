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
- Environment `production-db-readonly` に Secret `SUPABASE_READONLY_DB_URL` を登録する（任意）。読み取り専用ロールの Session pooler 接続文字列。未設定や DB Pause 時はリリース PR 本文に「手元で確認」の案内が出る（失敗にはならない）。

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

起動ガード（いずれも失敗する）: main 以外からの起動 / バージョン形式不正 / タグ重複（`REL-TAG-X.Y.Z`） / オープン中のリリース PR あり。

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

Vercel の本番デプロイ後に動作確認し、問題がなければ `create-release.yml` の承認ゲート（Environment `production-release`）を承認する。承認されるまでタグは作られない。マージコミットの SHA はワークフロー起動時に固定されるため、承認待ちの間に `release` が進んでも付け先がずれない。

承認後にマージコミットへ注釈付きタグ `REL-TAG-X.Y.Z` が作られ、GitHub Release が公開される（自動生成ノート + PR 本文のサマリー）。再実行しても重複作成しない（冪等）。

## トラブルシューティング

- `release-pr.yml` が「既存のリリース PR が open」で失敗する: 既存 PR をマージ/クローズしてから再実行する。
- `create-release.yml` が squash 検出で失敗する: release へのマージを merge commit でやり直す（PR を作り直す）。
- `create-release.yml` が承認ゲート未設定で失敗する: `production-release` に Required reviewers を設定して再実行する。
- `migration list` が「自動確認できませんでした」になる: Secret 未設定または DB Pause。手元で `yarn supabase migration list` を実行して確認する（リリース自体はブロックされない）。
- タグ重複で失敗する: バージョン番号を変える。部分失敗後の再実行で同名タグが同一 SHA を指している場合は正常系として続行される。

## 既存タグの扱い

既存の `REL-TAG-*` タグに対応する GitHub Release を遡って作るかは任意とする。必要になった時点で対象バージョンのタグから手動で作成する。
