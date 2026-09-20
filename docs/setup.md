# 開発環境構築ガイド

このドキュメントでは、経理システムの開発環境構築手順を詳しく説明します。

## 📋 目次

1. [前提条件](#前提条件)
2. [初期セットアップ](#初期セットアップ)
3. [Google 認証設定](#google-認証設定)
4. [ローカル Supabase 環境構築](#ローカル-supabase-環境構築)
5. [サンプルデータ投入](#サンプルデータ投入)
6. [データ移行（ローカル ↔ クラウド）](#データ移行)
7. [開発コマンド一覧](#開発コマンド一覧)
8. [Supabase keep-alive（自動 Pause 対策）](#supabase-keep-alive自動-pause-対策)
9. [トラブルシューティング](#トラブルシューティング)

---

## 前提条件

以下のソフトウェアがインストールされている必要があります：

- [Node.js](https://nodejs.org/) (v18 以上推奨)
- [Yarn](https://yarnpkg.com/) または npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Git](https://git-scm.com/)
- [PostgreSQL Client (psql)](https://www.postgresql.org/download/)

### インストール確認

```bash
node --version    # v18.0.0 以上
yarn --version    # 1.22.0 以上
docker --version  # 20.0.0 以上
git --version     # 2.30.0 以上
psql --version    # 13.0 以上
```

---

## 初期セットアップ

### 1. リポジトリのクローン

```bash
git clone [リポジトリURL]
cd accounting-system
```

### 2. 依存関係のインストール

```bash
yarn install
# または
npm install
```

### 3. Supabase CLI のバージョンについて

Supabase CLI は `package.json` の devDependencies にバージョン固定している。グローバルインストールは不要で、手順 2 の `yarn install` を実行すれば同じバージョンが入る。CLI を直接叩く場合は `yarn supabase <サブコマンド>` を使うこと（以降のコマンド例の `supabase ...` も同様に読み替える）。

```bash
yarn supabase --version
```

Cloud Agent 向けの `.cursor/setup/supabase-up.sh`（`SUPABASE_CLI_VERSION`）とはバージョン番号を一致させること。

---

## Google 認証設定

### 1. Google Cloud Console 設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成または既存プロジェクトを選択

### 2. OAuth 同意画面の設定

**APIs & Services > OAuth consent screen** で以下を設定：

- **User Type**: `External`を選択
- **Application name**: `Matter Controller Local`（適切な名前）
- **Authorized domains**:
  - `127.0.0.1`
  - `localhost`

### 3. OAuth 2.0 認証情報の作成

**APIs & Services > Credentials** で OAuth 2.0 クライアント ID を作成：

- **Application type**: `Web application`
- **Name**: `Matter Controller Local Dev`

**承認済みの JavaScript 生成元**:

```
http://localhost:3000
http://127.0.0.1:3000
```

**承認済みのリダイレクト URI**:

```
http://127.0.0.1:54321/auth/v1/callback
http://localhost:54321/auth/v1/callback
```

### 4. 認証情報の保存

作成したクライアント ID とクライアントシークレットをメモしておきます。

---

## ローカル Supabase 環境構築

### 1. Docker Desktop の起動

```bash
# macOSの場合
open -a Docker

# Windows/Linuxは手動でDocker Desktopを起動
```

### 2. Supabase プロジェクトの初期化

```bash
# プロジェクトディレクトリで実行
supabase init

# VS Code/IntelliJ設定の質問には「N」と回答
```

### 3. Supabase サービスの起動

```bash
supabase start
```

**重要**: 実行後に表示される情報をメモしてください：

```bash
         API URL: http://127.0.0.1:54321
        anon key: eyJhbGciOiJIUzI1NiIs... # これをNEXT_PUBLIC_SUPABASE_ANON_KEYに設定
service_role key: eyJhbGciOiJIUzI1NiIs... # これをSUPABASE_SERVICE_ROLE_KEYに設定
```

⚠️ **セキュリティ注意**: 上記の鍵は**実際の値**です。このドキュメントを他の開発者と共有する際は、必ず実際の鍵を削除してプレースホルダーに置き換えてください。

### 4. 環境変数の設定

プロジェクトルートに `.env.local` を新規作成する（リポジトリにテンプレートファイルは同梱していない）：

```env
# ローカル開発環境のSupabase設定
NEXT_PUBLIC_ENV=development
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=[supabase start実行後に表示されたanon key]
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=[supabase start実行後に表示されたservice_role key]
# 本番 Supabase の Reference ID（20文字の英小文字）。yarn db:types / MCP 用。
# ローカル Docker の config.toml project_id（accounting-system）ではない。
PROJECT_ID=[your-project-ref]
LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Google認証設定（Google Cloud Consoleで取得した値に置き換え）
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Slack設定（必要に応じて）
SLACK_WEBHOOK_URL=your-slack-webhook-url

# 事前収支申告の未申告リマインド（Vercel Cron）用
# Vercel Cron が付与する Authorization: Bearer ヘッダとの照合に使う。ローカルでは任意の値でよい。
CRON_SECRET=your-cron-secret
```

📋 **環境変数のセキュリティについて**:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: **秘匿情報** - 公開リポジトリや共有ドキュメントに記載しないでください
- `SUPABASE_SERVICE_ROLE_KEY`: **秘匿情報** - RLS を完全にバイパスできる強力な権限を持つキーのため、サーバー側でのみ使用し、決して公開しないでください。本アプリでは `app/api/cron/budget-declaration-reminder/route.ts`（cron ルート限定）が読み取り専用の参照にのみ使用しているが、キー自体の権限がそれに限定されるわけではない
- `GOOGLE_CLIENT_SECRET`: **秘匿情報** - 必ず秘匿してください
- `CRON_SECRET`: **秘匿情報** - Vercel Cron からのリクエストを認証するための値。第三者に知られると誰でも cron エンドポイントを叩けてしまう
- `SLACK_WEBHOOK_URL`: **秘匿情報** - Slack ワークスペースの機密情報です
- `PROJECT_ID`: **公開可能** - 本番（または型生成対象）Supabase の project ref。ローカル `config.toml` の `project_id` とは別物

### 5. データベーススキーマの作成

スキーマの正は `supabase/migrations/` 配下のマイグレーションです。適用されるのは **初回の `supabase start`（ボリューム新規作成時）** と **`supabase db reset`** です。既存の Docker ボリュームがある状態で `supabase start` しただけでは、追加分のマイグレーションは適用されません。

既存のローカル DB をマイグレーションと一致させたい場合:

```bash
supabase db reset
```

これにより `supabase/migrations/` の SQL がファイル名順に適用されます（enum / テーブル / インデックス / トリガー / RLS / 選択肢マスタの初期データ など）。スキーマ変更は必ずこのディレクトリに追加してください。

### 6. 開発サーバーの起動

```bash
yarn dev
# または
npm run dev
```

アプリケーションが http://localhost:3000 で起動します。

---

## サンプルデータ投入

### 1. マイグレーションで投入される初期データ

初回の `supabase start` または `supabase db reset` で適用されるマイグレーションに、選択肢マスタ（チーム・分類・品目など）の初期データが含まれます。案件・取引先・コストのサンプル行はリポジトリに含めていないため、ログイン後に画面から作成してください。

### 2. データ確認

```bash
# テーブル一覧確認
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\dt"

# マイグレーションで投入される選択肢マスタの件数確認
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
SELECT 'select_option_types' as table_name, COUNT(*) as record_count FROM select_option_types
UNION ALL
SELECT 'select_options' as table_name, COUNT(*) as record_count FROM select_options;
"
```

### 3. データベース接続の簡略化

毎回長い URL を入力するのを避けるため、エイリアスを設定：

```bash
# 現在のセッションで使用
alias supa-db='psql postgresql://postgres:postgres@127.0.0.1:54322/postgres'

# 永続化（お使いのシェルに応じて）
echo "alias supa-db='psql postgresql://postgres:postgres@127.0.0.1:54322/postgres'" >> ~/.zshrc
# または ~/.bashrc
```

使用例：

```bash
supa-db                               # 対話モードで接続
supa-db -c "SELECT * FROM profiles;"  # SQLを直接実行
```

---

## データ移行

### ローカル → クラウド環境への移行

#### 1. ローカルデータのエクスポート

```bash
# スキーマのみをエクスポート
supabase db dump --schema-only > schema.sql

# データのみをエクスポート
supabase db dump --data-only > data.sql

# 全体をエクスポート
supabase db dump > full_backup.sql
```

#### 2. テスト環境設定への切り替え

`.env.local`ファイルを編集して、テスト環境の設定を有効化：

```env
# ローカル設定をコメントアウト
# NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# テスト環境設定を有効化
NEXT_PUBLIC_ENV=development
NEXT_PUBLIC_SUPABASE_URL=https://[your-project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_URL=https://[your-project-id].supabase.co
PROJECT_ID=[your-project-id]
```

#### 3. クラウド環境へのスキーマ適用

```bash
# テスト環境にリンク
supabase link --project-ref [your-project-id]

# スキーマを適用
supabase db push
```

#### 4. データの移行

```bash
# テスト環境のデータベース接続情報は
# Supabaseダッシュボード > Settings > Database で確認

# データを投入（接続URLは要確認）
psql "postgresql://postgres:[password]@db.[your-project-id].supabase.co:5432/postgres" < data.sql
```

### クラウド → ローカル環境への移行

```bash
# クラウド環境から最新データを取得
supabase db pull

# ローカル環境の設定に戻す
# .env.localファイルをローカル設定に戻す

# ローカルSupabaseを再起動
supabase stop && supabase start
```

---

## 開発コマンド一覧

### Supabase 関連

```bash
# 状態確認
supabase status

# サービス開始・停止
supabase start
supabase stop

# データベースリセット
supabase db reset

# データベース接続
supa-db  # エイリアス設定後

# ログ確認
supabase logs
docker logs supabase_db_accounting-system
docker logs supabase_auth_accounting-system
```

### アプリケーション

```bash
# 開発サーバー起動
yarn dev

# ビルド
yarn build

# 型定義の更新（ローカルでスキーマ変更したとき）
yarn db:types-local

# 型定義の更新（本番 Supabase から生成するとき）
yarn db:types

# リント
yarn lint
```

### データベース操作

```bash
# テーブル一覧
supa-db -c "\dt"

# ユーザー確認
supa-db -c "SELECT * FROM auth.users;"

# 案件一覧
supa-db -c "SELECT title, category, team FROM matters;"

# データベースバックアップ
pg_dump postgresql://postgres:postgres@127.0.0.1:54322/postgres > backup.sql
```

---

## 開発環境詳細情報

### 利用可能なエンドポイント

- **アプリケーション**: http://localhost:3000
- **Supabase Studio**: http://127.0.0.1:54323 （データベース管理画面）
- **Supabase API**: http://127.0.0.1:54321
- **PostgreSQL**: postgresql://postgres:postgres@127.0.0.1:54322/postgres
- **Inbucket（メールテスト）**: http://127.0.0.1:54324

### 認証について

- ローカル環境では`future-tech-association.org`ドメインの Google アカウントのみログイン可能
- テスト時にドメイン制限を無効化したい場合は、`app/components/auth/auth-components.tsx`の`isAllowedDomain`関数を一時的に`return true;`に変更

### ファイル構成

```
accounting-system/
├── .env.local                 # 環境変数（ローカル用。gitignore。手順 4 で新規作成）
├── .github/
│   └── workflows/            # GitHub Actions（CI と Supabase keep-alive）
├── supabase/
│   ├── .gitignore            # Supabase用gitignore
│   ├── config.toml           # Supabase設定
│   └── migrations/           # データベーススキーマ（正。ファイル名順に適用）
└── docs/
    ├── setup.md                 # 開発環境構築手順（本ファイル）
    ├── specification.md         # 詳細設計書
    ├── database.md              # データベース設計書
    └── testing.md               # テスト設計書
```

---

## Supabase keep-alive（自動 Pause 対策）

### 背景

Supabase 無料プランのプロジェクトは **1 週間アクセスが無いと自動で Pause** され、`<project-ref>.supabase.co` の DNS レコードも消える。Pause 中は Vercel 上の middleware が `getaddrinfo ENOTFOUND <project-ref>.supabase.co` で Supabase Auth に到達できず、全ページが `504 MIDDLEWARE_INVOCATION_TIMEOUT` になる（Issue #125）。Pro プランへは移行しないため、定期的に DB へリクエストを送って Pause を防ぐ。

### 仕組み

- `.github/workflows/supabase-keepalive.yml`（GitHub Actions、`schedule: cron`）が **毎日 06:00 JST（21:00 UTC）** に自動実行される。
- 開発用・本番用の 2 プロジェクトを matrix（`dev` / `prod`）で並列に処理し、それぞれの REST エンドポイントに anon key で軽い SELECT を送る。

  ```
  GET {SUPABASE_URL}/rest/v1/select_options?select=id&limit=1
  apikey: <anon key>
  Authorization: Bearer <anon key>
  ```

  `select_options` は RLS で anon（未ログイン）にも SELECT を許可しているテーブル（[`docs/database.md` 5.5](./database.md#55-select_option_types-テーブルselect_options-テーブル)）で、PostgREST 経由で DB に届くため Supabase 側のアクティビティとして扱われる。Auth API の `/auth/v1/health` だけでは DB アクティビティとして数えられない可能性があるため使わない。

- レスポンスが 2xx 以外、または接続自体に失敗した場合（DNS 失敗 / タイムアウト）はジョブを **fail** にする。片方のプロジェクトが失敗してももう片方には必ずリクエストを送る（`fail-fast: false`）。
- Vercel Cron（`vercel.json`）を使わない理由: Vercel Cron は production デプロイでしか動かないため、main のプレビュー環境が向いている開発用 Supabase を叩けない。また Hobby プランは cron 2 本・1 日 1 回までの制限があり、既存の `/api/cron/budget-declaration-reminder` で 1 本使っている。
- 本番用 Supabase は、既存の Vercel Cron（`/api/cron/budget-declaration-reminder`、毎日 00:00 UTC）が対象日判定の前に `budget_declaration_reminder_settings` を SELECT するため、単体でも毎日 DB アクティビティが発生している。Issue #125 で Pause したのは Vercel Cron の対象外である開発用（main プレビュー環境向け）側であり、本番側の keep-alive は Vercel Cron が停止・削除された場合の保険として含めている。

### 必要な GitHub Secrets

リポジトリの **Settings > Secrets and variables > Actions > Repository secrets** に以下の 4 つを登録する。未設定のままだと該当ジョブは「Secrets が未設定」のエラーで fail する。

| Secret 名                          | 値                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `KEEPALIVE_SUPABASE_URL_DEV`       | 開発用 Supabase の API URL（`https://<project-ref>.supabase.co`）                |
| `KEEPALIVE_SUPABASE_ANON_KEY_DEV`  | 開発用 Supabase の anon key（アプリの `NEXT_PUBLIC_SUPABASE_ANON_KEY` と同じ値） |
| `KEEPALIVE_SUPABASE_URL_PROD`      | 本番用 Supabase の API URL                                                       |
| `KEEPALIVE_SUPABASE_ANON_KEY_PROD` | 本番用 Supabase の anon key                                                      |

- URL / anon key は Supabase ダッシュボードの **Settings > API** で確認できる。URL は `https://` 付きで登録する（末尾のスラッシュは有無どちらでもよい。前後の改行・空白は実行時に除去される）。形式が不正な場合は「URL 形式が不正」のエラーでジョブが fail する。
- anon key は公開前提の鍵だが、リポジトリに直書きせず Secrets 経由で渡す。anon key をローテーションした場合や、Supabase の新形式キー（`sb_publishable_...`）へ切り替えた場合は Secrets の値も差し替え、手動実行（後述）で 200 が返ることを確認すること（ワークフロー側の `apikey` / `Authorization` ヘッダは変更不要）。

### 動作確認（手動実行）

1. GitHub の **Actions > Supabase Keep-Alive > Run workflow** で `main` を選んで実行する（`workflow_dispatch`）。ワークフローファイルが `main` に存在して初めて Actions 画面に表示されるため、手動実行は **main へのマージ後** に行う（PR ブランチ上では実行できない）。
2. `keep-alive (dev)` / `keep-alive (prod)` の両ジョブが成功し、ログにそれぞれ `[dev] OK: HTTP 200` / `[prod] OK: HTTP 200` が出ていることを確認する。
3. 以降は Actions の実行履歴（`schedule` イベント）で毎日成功していることを確認できる。失敗時は GitHub の Actions 失敗通知で気付けるが、`schedule` 起動の実行者は **ワークフローファイルの cron を最後に変更したユーザー** になるため、通知もその 1 人にしか届かない。複数人で監視したい場合は失敗時に Slack へ通知する step を追加するなどの対応を検討する。

すでに Pause してしまっている場合は、先に Supabase ダッシュボードで対象プロジェクトを **Restore** してから実行する（Pause 中は DNS が消えているためワークフローは接続失敗で fail する）。

### 注意事項

- `schedule` トリガーはデフォルトブランチ（`main`）上のワークフロー定義でのみ動く。ブランチ上で編集しても main にマージされるまで自動実行には反映されない。
- 本リポジトリは公開リポジトリのため、60 日間リポジトリに活動（コミット等）が無いと GitHub が schedule ワークフローを自動的に無効化する。利用頻度が低い期間はまさに Supabase が Pause する状況でもあるので、Actions 画面で無効化されていないか定期的に確認すること（無効化された場合は **Enable workflow** で再開する）。
- GitHub Actions の `schedule` は負荷状況により数分〜数十分遅延することがあるが、keep-alive の目的（週 1 回以上のアクセス）には影響しない。

### 停止手順

- **一時停止**: GitHub の **Actions > Supabase Keep-Alive > ⋯ > Disable workflow**。再開は同じ場所の **Enable workflow**。
- **恒久的に廃止**: `.github/workflows/supabase-keepalive.yml` を削除して main にマージし、上記 4 つの Secrets も削除する（Pro プランに移行した場合など）。

---

## トラブルシューティング

### project_id 変更後のローカル再起動

`supabase/config.toml` の `project_id` が変わると、Docker のコンテナ／ボリューム名も変わる。旧 id のスタックがポート 54321〜54324 を掴んだままだと `supabase start` は `port is already allocated` で失敗する。`supabase db reset` は **いまの** `project_id` にしか効かない。

```bash
# pull 前なら
supabase stop

# すでに pull 済みで旧スタックが残っている場合
supabase stop --project-id matter-controller
supabase start
```

`supabase start` は新規ボリュームにマイグレーションを適用する。この切り替えだけでは `db reset` は不要。

旧ボリューム（例: `supabase_db_matter-controller`）に入っていたローカル開発データは新しいスタックからは見えず、ディスク上には残る。本番データには影響しない。不要になったら `docker volume ls` で確認して削除する。

Cloud Agent 向けの `.cursor/setup/supabase-up.sh` は、起動時に旧 `project_id` のスタックを `supabase stop --project-id` してから現在の id で `start` する。

### Docker 関連のエラー

```bash
# Dockerが起動していない場合
open -a Docker  # macOS
# Windows/LinuxではDocker Desktopを手動起動

# Dockerコンテナの状態確認
docker ps

# Supabaseコンテナの再起動
supabase stop && supabase start

# Dockerボリュームの確認
docker volume ls --filter label=com.supabase.cli.project=accounting-system
```

### データベース接続エラー

```bash
# データベース接続確認
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "SELECT version();"

# テーブル確認
supa-db -c "\dt"

# Supabaseサービス状態確認
supabase status
```

### 認証エラー

1. **Google Cloud Console の設定を再確認**
   - リダイレクト URI が正確に設定されているか
   - JavaScript 生成元が正しく設定されているか

2. **環境変数の確認**
   - `.env.local`の`GOOGLE_CLIENT_ID`と`GOOGLE_CLIENT_SECRET`が正しいか
   - Supabase のキーが最新か

3. **Supabase の再起動**
   ```bash
   supabase stop && supabase start
   ```

### ポートが使用中のエラー

```bash
# ポート使用状況確認
lsof -i :3000   # Next.js
lsof -i :54321  # Supabase API
lsof -i :54322  # PostgreSQL

# プロセス終了
kill -9 [PID]

# または異なるポートを使用
yarn dev --port 3001
```

### スキーマエラー

```bash
# データベースをリセットし、supabase/migrations/ を再適用
supabase db reset

# 型定義更新（ローカル）
yarn db:types-local
```

### パフォーマンス問題

```bash
# Dockerリソース確認
docker stats

# Supabaseログ確認
supabase logs

# データベース接続数確認
supa-db -c "SELECT count(*) FROM pg_stat_activity;"
```

---

## 開発時の注意事項

### データ管理

- **ローカル環境のデータ**は`supabase stop`時に Docker ボリュームに保存されます
- **重要なデータ変更前**は必ずバックアップを取ってください
- **スキーマ変更後**は`yarn db:types-local`で型定義を更新してください（本番から生成する場合のみ `yarn db:types`）

### セキュリティ

- **機密情報を Git にコミットしない**ように注意してください
- **`.env.local`ファイルは gitignore に含まれています**
- **プロダクション環境への影響を避ける**ため、ローカル環境のみで開発してください

### チーム開発

- **ブランチ命名規則**: `feature/機能名`、`fix/修正内容`
- **コミットメッセージ**は日本語で簡潔に記述してください
- **プルリクエスト作成前**にローカルでのテストを必ず実行してください
- **新機能開発前**に、issue で議論してください

---

## サポート

### 公式ドキュメント

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

### 内部ドキュメント

- [`docs/database.md`](./database.md) - データベース設計書
- [`docs/specification.md`](./specification.md) - アプリケーション仕様書
- [`docs/sql-queries.md`](./sql-queries.md) - 便利な SQL クエリ集

### お問い合わせ

開発環境に関する問題や質問があれば、以下にお問い合わせください：

info@future-tech-association.org
