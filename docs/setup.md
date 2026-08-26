# 開発環境構築ガイド

このドキュメントでは、経理システムの開発環境構築手順を詳しく説明します。

## 📋 目次

1. [前提条件](#前提条件)
2. [初期セットアップ](#初期セットアップ)
3. [Google 認証設定](#google認証設定)
4. [ローカル Supabase 環境構築](#ローカルsupabase環境構築)
5. [サンプルデータ投入](#サンプルデータ投入)
6. [データ移行（ローカル ↔ クラウド）](#データ移行)
7. [開発コマンド一覧](#開発コマンド一覧)
8. [トラブルシューティング](#トラブルシューティング)
9. [本番カットオーバー](./production-cutover.md)（旧本番 → `accounting-system` への一本化。ダッシュボード作業）

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

### 3. Supabase CLI のインストール

```bash
# Homebrewを使用（macOS）
brew install supabase/tap/supabase

# その他のインストール方法
# Windows: https://supabase.com/docs/guides/cli/getting-started#windows
# Linux: https://supabase.com/docs/guides/cli/getting-started#linux

# インストール確認
supabase --version
```

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
PROJECT_ID=accounting-system
LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Google認証設定（Google Cloud Consoleで取得した値に置き換え）
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Slack設定（必要に応じて）
SLACK_WEBHOOK_URL=your-slack-webhook-url
```

📋 **環境変数のセキュリティについて**:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: **秘匿情報** - 公開リポジトリや共有ドキュメントに記載しないでください
- `SUPABASE_SERVICE_ROLE_KEY`: **秘匿情報** - サーバー側でのみ使用し、決して公開しないでください
- `GOOGLE_CLIENT_SECRET`: **秘匿情報** - 必ず秘匿してください
- `SLACK_WEBHOOK_URL`: **秘匿情報** - Slack ワークスペースの機密情報です
- `PROJECT_ID`: **公開可能** - プロジェクトの識別子であり、公開されても問題ありません

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
├── supabase/
│   ├── .gitignore            # Supabase用gitignore
│   ├── config.toml           # Supabase設定
│   └── migrations/           # データベーススキーマ（正。ファイル名順に適用）
└── docs/
    ├── setup.md                 # 開発環境構築手順（本ファイル）
    ├── specification.md         # 詳細設計書
    ├── database.md              # データベース設計書
    ├── testing.md               # テスト設計書
    └── production-cutover.md    # 本番カットオーバー手順（運用）
```

---

## トラブルシューティング

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
