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

Cloud Agent 向けの `.cursor/setup/supabase-up.sh`（`SUPABASE_CLI_VERSION`）とはバージョン番号を一致させること。このスクリプトは起動時に、下の「環境変数の設定」と同じ 8 変数だけの `.env.local` を書く。

---

## Google 認証設定

ローカルの Google ログインは、Supabase Auth がブラウザを Google へリダイレクトし、認可コードをローカル API（`http://127.0.0.1:54321`）が受け取るサーバサイドフローである。Google 側に必要なのは **承認済みのリダイレクト URI** だけで、承認済みの JavaScript 生成元は登録しない。

`supabase/config.toml` の `[auth.external.google]` は **ローカルスタック専用** である。ホスト版（開発用・本番の Supabase プロジェクト）には適用されない。ホスト版の Google プロバイダは、Supabase ダッシュボードで **Authentication** を開いた画面（タイトルは **Sign In / Providers**、パスは `/auth/providers`）で別途設定する。ローカル Studio（`http://127.0.0.1:54323`）でも同じ画面になる。

### 1. Google Auth Platform を開く

1. [Google Auth Platform の Overview](https://console.cloud.google.com/auth/overview) を開く
2. プロジェクトを選択するか、新しく作成する

旧メニュー **APIs & Services > OAuth consent screen** と **APIs & Services > Credentials** は廃止されている。同意画面とクライアントは、Google Auth Platform の **Branding / Audience / Clients / Data Access** に分かれている。

### 2. アプリ情報と Audience

Overview に **Get started** が出ている場合はそれに従い、アプリを登録する。すでに登録済みなら **Branding** と **Audience** を確認する。

- **App name**（Branding）: `accounting-system Local`
- **User support email**: 自分のメールアドレス
- **Audience**（対象ユーザー）は、GCP プロジェクトの置き場所で選べる値が変わる
  - `future-tech-association.org` の Google Workspace 組織配下にプロジェクトがある場合は **Internal** を選べる。組織のメンバーだけがログインできる
  - 個人の Google アカウント配下のプロジェクトは **External** しか選べない。このときは **Audience > Test users** にログインする `@future-tech-association.org` アカウントを追加する。未登録のままログインすると `Error 403: access_denied` になる
- 連絡先メールを入れ、Google API Services User Data Policy に同意して作成する

Branding の **Authorized domains** に `localhost` や `127.0.0.1` は入れない。ここは同意画面に出す公開ドメインの所有確認用であり、ローカル開発のリダイレクト先ではない。

Sign in with Google に必要なスコープ（`openid` / `email` / `profile`）は既定で足りる。**Data Access** でそれ以外のスコープは追加しない。

### 3. OAuth クライアントの作成

[Google Auth Platform > Clients](https://console.cloud.google.com/auth/clients) で **Create client** を押す。

- **Application type**: `Web application`
- **Name**: `accounting-system Local Dev`
- **Authorized redirect URIs**:

```
http://127.0.0.1:54321/auth/v1/callback
http://localhost:54321/auth/v1/callback
```

**Authorized JavaScript origins** は空のままにする。本アプリはブラウザから Google のトークンエンドポイントを直接叩かない。

### 4. クライアントシークレットの保管

クライアント ID は後から Clients 画面で再表示できる。クライアントシークレットはそうではない。

2025 年 6 月以降に作成したクライアント（既存クライアントも 2025 年 11 月以降、順次）はシークレットがハッシュ化され、**作成完了ダイアログの一度しか全文を表示・ダウンロードできない**。以降の Console には末尾 4 文字しか出ない。紛失した場合はローテーションで再発行するしかない。

作成完了ダイアログで JSON をダウンロードし、パスワードマネージャなどに保管してからダイアログを閉じる。クライアント ID を `GOOGLE_CLIENT_ID`、クライアントシークレットを `GOOGLE_CLIENT_SECRET` として、次の「環境変数の設定」で `.env.local` に書く。

参考: [Manage OAuth Clients（クライアントシークレットは作成時のみ表示）](https://support.google.com/cloud/answer/15549257)

---

## ローカル Supabase 環境構築

### 1. Docker Desktop の起動

```bash
# macOSの場合
open -a Docker

# Windows/Linuxは手動でDocker Desktopを起動
```

`supabase init` は実行しない。`supabase/config.toml` はリポジトリにコミット済みで、`supabase init` は既存の設定を上書きする恐れがある。

### 2. 環境変数の設定

プロジェクトルートに `.env.local` を新規作成する（リポジトリにテンプレートファイルは同梱していない）。値に空白やシェルの特殊文字が含まれる場合はダブルクォートで囲む。

```env
# ローカル Supabase。URL とキーは次の「Supabase の起動」で表示された値に置き換える。
# 初回起動前はプレースホルダのままでよい（起動後に書き換えて dev サーバを再起動する）。
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-after-supabase-start
SUPABASE_SERVICE_ROLE_KEY=replace-after-supabase-start

# ホスト版 Supabase の Reference ID（20 文字の英小文字）。yarn db:types / .mcp.json 用。
# ローカル Docker の config.toml project_id（accounting-system）ではない。
PROJECT_ID=your-project-ref

# Google 認証。config.toml の env() が読む。値は Google Auth Platform > Clients で取得する。
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Slack 通知。未使用なら空でよい。
SLACK_WEBHOOK_URL=

# 事前収支申告の未申告リマインド（Vercel Cron）用。
# Vercel Cron が付与する Authorization: Bearer との照合に使う。ローカルでは任意の値でよい。
CRON_SECRET=your-cron-secret
```

`.env.local` に書くのは次の 8 つである。アプリが参照するが `.env.local` には書かない名前は、その下の表に分けてある。

| 書かない名前                                   | 理由                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ENV`                              | アプリも設定ファイルも参照しない                                                                                                                                                                |
| `SUPABASE_URL`                                 | アプリは参照しない。GitHub Actions の keep-alive ジョブが同名の **ジョブ内** 環境変数を使うが、登録する Secret 名は `KEEPALIVE_SUPABASE_URL_DEV` / `KEEPALIVE_SUPABASE_URL_PROD` である（後述） |
| `LOCAL_DB_URL`                                 | アプリは参照しない。ローカル Postgres へは手順中の接続文字列を直接使う                                                                                                                          |
| `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` | Vercel が本番ランタイムに注入する。申告ページ URL の組み立てにだけ使い、`.env.local` には追加しない                                                                                             |
| `ANALYZE`                                      | `ANALYZE=true yarn build` のときだけバンドル分析を有効にする。常設の設定ではない                                                                                                                |

| 変数                            | 参照箇所                                                                         | 取り扱い                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `app/utils/supabase/clients.ts`、`middleware.ts`                                 | ローカルは `http://127.0.0.1:54321`。ホスト版は `https://<project-ref>.supabase.co`                                                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上                                                                             | 低権限のキー。公開リポジトリや共有ドキュメントに値を書かない                                                                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | `createServiceRoleSupabase`（`app/utils/supabase/clients.ts`）                   | RLS をバイパスする。サーバ側のみ。本アプリでは `app/api/cron/budget-declaration-reminder/route.ts` の読み取りにだけ使うが、キー自体の権限はそれに限定されない |
| `PROJECT_ID`                    | `package.json` の `db:types`、`.mcp.json`                                        | 公開可能な project ref。`config.toml` の `project_id` とは別物                                                                                                |
| `GOOGLE_CLIENT_ID`              | `supabase/config.toml` の `env(GOOGLE_CLIENT_ID)`                                | ローカル Supabase 専用                                                                                                                                        |
| `GOOGLE_CLIENT_SECRET`          | `supabase/config.toml` の `env(GOOGLE_CLIENT_SECRET)`                            | 秘匿。ローカル Supabase 専用                                                                                                                                  |
| `SLACK_WEBHOOK_URL`             | `app/actions/slack/index.ts`、`app/utils/slack/sendBudgetDeclarationReminder.ts` | 秘匿                                                                                                                                                          |
| `CRON_SECRET`                   | `app/api/cron/budget-declaration-reminder/route.ts`                              | 秘匿。第三者に知られると cron エンドポイントを叩ける                                                                                                          |

`config.toml` の `env(...)` は、Supabase CLI 2.115 が次の順で解決する。先に見つかった値を使う。

1. CLI を起動したシェルの環境変数
2. ファイル。`SUPABASE_ENV` 未設定時の既定は `development` で、`supabase/` ディレクトリをプロジェクトルートより先に、`.env.development.local`、`.env.local`、`.env.development`、`.env` の順に読む

通常はプロジェクトルートの `.env.local` に書いて `yarn supabase start` する。`set -a` で export しなくても Google のクライアント ID は渡る。シェルや `supabase/.env.local` に空でない値が残っていると、プロジェクトルートの `.env.local` は使われない。

どちらにも値が無いと置換されず、認証コンテナのクライアント ID が文字列 `env(GOOGLE_CLIENT_ID)` のままになる。この CLI は Google の項目に対して `WARN: environment variable is unset` を出さない（その警告は OrioleDB 用の S3 変数だけ）。起動後に次で確認する。

```bash
docker exec supabase_auth_accounting-system printenv GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID
```

表示が `.env.local` の `GOOGLE_CLIENT_ID` と一致していればよい。`env(GOOGLE_CLIENT_ID)` のままなら未設定で、ローカルの Google 認証は動かない。

### 3. Supabase サービスの起動

```bash
yarn supabase start
```

起動後、`yarn supabase status` の Pretty 表示で `.env.local` の次の 3 つを書き換える。

| Pretty 表示 | `.env.local`                    |
| ----------- | ------------------------------- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL`      |
| Publishable | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret      | `SUPABASE_SERVICE_ROLE_KEY`     |

`yarn supabase status -o env` には、同じ値に加えて JWT の `ANON_KEY` / `SERVICE_ROLE_KEY`（`eyJ...`）も出る。このリポジトリの `@supabase/supabase-js` 2.46.1 とローカル API の組み合わせでは、Pretty 表示の Publishable / Secret でも、`-o env` の JWT でも、`select_options` の読み取りは成功する。変数名は上表のまま変えない。ホスト版ダッシュボードも既定で publishable key / secret key を表示する。同じ変数名にその値を入れてよい。Legacy API Keys タブの JWT も同じ変数に入れて使える。

キーの値はこのドキュメントに書かない。

### 4. データベーススキーマの作成

スキーマの正は `supabase/migrations/` 配下のマイグレーションです。適用されるのは **初回の `supabase start`（ボリューム新規作成時）** と **`supabase db reset`** です。既存の Docker ボリュームがある状態で `supabase start` しただけでは、追加分のマイグレーションは適用されません。

既存のローカル DB をマイグレーションと一致させたい場合:

```bash
supabase db reset
```

これにより `supabase/migrations/` の SQL がファイル名順に適用されます（enum / テーブル / インデックス / トリガー / RLS / 選択肢マスタの初期データ など）。スキーマ変更は必ずこのディレクトリに追加してください。

### 5. 開発サーバーの起動

```bash
yarn dev
# または
npm run dev
```

アプリケーションが http://localhost:3000 で起動する。

`NEXT_PUBLIC_*` は dev サーバ起動時に埋め込まれる。`.env.local` の `NEXT_PUBLIC_SUPABASE_URL` または `NEXT_PUBLIC_SUPABASE_ANON_KEY` を変えたあとは、dev サーバを止めてから再度 `yarn dev` する。再起動しないと、ローカル Supabase を起動していてもアプリは変更前の接続先（本番を向いたまま、など）に接続し続ける。

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
# スキーマのみ（CLI 2.115 の既定。--schema-only フラグは無い）
supabase db dump --local -f schema.sql

# データのみ
supabase db dump --local --data-only -f data.sql
```

`--local` を付けないと、リンク済みのリモートをダンプしようとする。未リンクだと `Cannot find project ref` で失敗する。

#### 2. ホスト版 Supabase への切り替え

`.env.local` の次の 2 つは **セットで** 切り替える。URL だけ、またはキーだけを本番向けにすると、認証もデータも期待したプロジェクトに繋がらない。

```env
# ホスト版を使う間は、ローカルの 2 行をコメントアウトしたままにする。
# ローカルに戻すときは、ホスト版の 2 行をコメントアウトし、ローカルの 2 行のコメントを外す。
# NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<local publishable key>

NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<hosted publishable or legacy anon key>
SUPABASE_SERVICE_ROLE_KEY=<hosted secret or legacy service_role key>
PROJECT_ID=<project-ref>
```

- Project URL は `https://<project-ref>.supabase.co` で決まる。Reference ID が分かっていれば、ダッシュボードを探す必要はない。画面で確認するときは **Project Settings** の INTEGRATIONS にある **Data API**（`/integrations/data_api/overview`）の API URL を使う。旧 **Settings > API**（`/settings/api`）はこの Data API へリダイレクトされる。左の最上位 **Integrations** は連携カードの一覧であり、API URL の画面そのものではない
- キーは同じ **Project Settings** の **API Keys**（`/settings/api-keys`）にある。既定表示は publishable key（`sb_publishable_...`）と secret key（`sb_secret_...`）。JWT 形式が必要なら同じ画面の **Legacy API Keys** タブを開く
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` はローカルの `config.toml` 専用である。ホスト版の Google ログインには効かない
- 切り替え後は dev サーバを再起動する

`supabase start` が成功していても、`.env.local` がホスト版を向いていればアプリはホスト版に接続する。切り分けには、ローカル Auth が Google へ飛ばす先を見る（認証情報は不要）。

```bash
curl -s -o /dev/null -w "%{redirect_url}\n" "http://127.0.0.1:54321/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback"
```

ローカルの Google クライアントが有効で、認証コンテナから `accounts.google.com` へ出られるなら、リダイレクト先のホストは `accounts.google.com` になる。`504`（`context deadline exceeded`）のときは、認証コンテナから Google へ届いていない。切り分けはトラブルシューティングの「認証コンテナから Google へ届かない」を見る。アプリ側が別プロジェクトを向いていないかは、再起動後のブラウザのネットワークで `NEXT_PUBLIC_SUPABASE_URL` のホストを確認する。

#### 3. クラウド環境へのスキーマ適用

```bash
# テスト環境にリンク
supabase link --project-ref [your-project-id]

# スキーマを適用
supabase db push
```

アプリが新しい RPC / テーブルを参照するリリースより **先に**（または同時に）対応マイグレーションを適用すること。未適用のままアプリだけ先行すると、PostgREST は `PGRST202`（schema cache に関数が無い）を返す。例: `main` の `get_member_options()`（migration 21）は、本番 `release` に載せる前に `supabase db push` が必要。

#### 4. データの移行

接続 URI はプロジェクトの Connect ダイアログに出る。ダイアログの文字列をそのまま使う（Database password が必要）。次はダイレクト接続の形の例である。

```bash
psql "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" < data.sql
```

### クラウド → ローカル環境への移行

`supabase db pull` はリモートのスキーマを新しいマイグレーションファイルとして保存する。行データのコピーではなく、先に `supabase link` が必要である。既存ボリュームに対する `supabase start` だけでは、そのファイルは適用されない。

```bash
supabase link --project-ref <project-ref>
supabase db pull
supabase db reset
```

行データが必要なら、リンク済みプロジェクトから data-only ダンプを取る。

```bash
supabase db dump --linked --data-only -f data.sql
```

`.env.local` をローカルの URL とキーに戻したあとは、dev サーバを再起動する。

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

# ログ確認（supabase logs サブコマンドは CLI 2.115 に無い）
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

- ローカル環境でも `@future-tech-association.org` の Google アカウントだけがログインできる。判定は `app/utils/constants.ts` の `isAllowedEmailDomain` で、強制は `app/auth/callback/route.ts` が行う。ログインボタン側（`app/components/auth/auth-components.tsx`）のチェックは UX 用であり、ここだけを変えてもコールバックが拒否する

### ファイル構成

```
accounting-system/
├── .env.local                 # 環境変数（ローカル用。gitignore。「環境変数の設定」で新規作成）
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

Supabase 無料プランは 1 週間アクセスが無いとプロジェクトが自動 Pause されるため、`.github/workflows/supabase-keepalive.yml`（GitHub Actions、毎日 06:17 JST）が開発用・本番用の両 Supabase に anon key で軽い SELECT を送って Pause を防いでいる（Issue #125）。仕組みや注意事項はワークフローファイル冒頭のコメントを参照。ここでは運用に必要な設定と手順だけを記載する。

### 必要な GitHub Secrets

リポジトリの **Settings > Secrets and variables > Actions > Repository secrets** に以下の 4 つを登録する。未設定のままだと該当ジョブは「Secrets が未設定」のエラーで fail する。

| Secret 名                          | 値                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `KEEPALIVE_SUPABASE_URL_DEV`       | 開発用 Supabase の API URL（`https://<project-ref>.supabase.co`）                |
| `KEEPALIVE_SUPABASE_ANON_KEY_DEV`  | 開発用 Supabase の anon key（アプリの `NEXT_PUBLIC_SUPABASE_ANON_KEY` と同じ値） |
| `KEEPALIVE_SUPABASE_URL_PROD`      | 本番用 Supabase の API URL                                                       |
| `KEEPALIVE_SUPABASE_ANON_KEY_PROD` | 本番用 Supabase の anon key                                                      |

- これら 4 つは GitHub の Repository secrets であり、`.env.local` の変数名とは一致しない。とくに URL 用 Secret は `SUPABASE_URL` ではない（ジョブ内で `SUPABASE_URL` という環境変数に展開しているだけである）。
- Project URL は `https://<project-ref>.supabase.co`。Reference ID が分かればこの形で登録できる。画面で確認するときは **Project Settings** の **Data API** に出る API URL を使う。`https://` 付きで登録する（末尾のスラッシュや前後の空白は無視される。形式が不正な場合は「URL 形式が不正」のエラーで fail する）。
- キーは **Project Settings > API Keys** の publishable key、または同じ画面の **Legacy API Keys** の anon key を使う。ワークフローは `apikey` と `Authorization: Bearer` の両方に同じ値を載せる。ホスト版で publishable key が `Invalid JWT` になる場合は、Legacy API Keys の JWT 形式 anon key に差し替える。
- キーをローテーションした場合は Secrets の値も差し替え、手動実行で 200 が返ることを確認する。

### 動作確認（手動実行）

1. GitHub の **Actions > Supabase Keep-Alive > Run workflow** で `main` を選んで実行する。ワークフローが `main` に存在して初めて Actions 画面に表示されるため、手動実行は main へのマージ後に行う。
2. `keep-alive (dev)` / `keep-alive (prod)` の両ジョブが成功し、ログに `[dev] OK: HTTP 200` / `[prod] OK: HTTP 200` が出ていることを確認する。
3. 以降は Actions の実行履歴（`schedule` イベント）で毎日成功していることを確認できる。

すでに Pause してしまっている場合は、先に Supabase ダッシュボードで対象プロジェクトを **Restore** してから実行する（Pause 中は DNS が消えているため接続失敗で fail する）。

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

### `yarn dev` が App Router と無関係なエラーで落ちる

`node_modules` が無い状態で `yarn dev` を実行すると、yarn が PATH 上のグローバル `next` にフォールバックすることがある。スタックトレースのパスが `/usr/local/lib/node_modules/next` で、次のような `app` ディレクトリの実験的機能エラーが出たら、依存関係の未インストールを疑う。

```
Error: > The `app` directory is experimental. To enable, add `appDir: true` to your `next.config.js` ...
    at Object.findPagesDir (/usr/local/lib/node_modules/next/dist/lib/find-pages-dir.js:80:19)
```

```bash
yarn install
npm uninstall -g next
```

グローバルな `next` は削除してよい。以降はプロジェクトの `node_modules` にある Next.js を使う。

### ローカル Supabase を起動しているのに本番へ繋がる

`yarn supabase start` と `yarn dev` が両方成功しても、`.env.local` の `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` がホスト版のままだと、アプリはホスト版に接続する。ローカルの Google クライアント設定は効かない。

この 2 つはセットでローカル（`http://127.0.0.1:54321` と、そのスタックの anon / publishable key）に戻し、dev サーバを再起動する。`NEXT_PUBLIC_*` の変更は再起動するまで反映されない。

### 認証コンテナから Google へ届かない

`/auth/v1/authorize` が `504`（`context deadline exceeded`）のとき、GoTrue は Google の認可 URL を返す前に `accounts.google.com` へ届いていない。ホストからは開けるのに認証コンテナからだけ失敗する場合は、Supabase 用 Docker bridge の転送がホストの firewall で落ちている。

```bash
docker exec supabase_auth_accounting-system wget -q -O /dev/null -T 10 https://accounts.google.com/
```

終了コードが 0 ならコンテナから届いている。届かないとき、`sudo iptables-legacy -L FORWARD` の policy が `DROP` で、許可が `docker0` だけのときは、Supabase の bridge（ネットワーク名 `supabase_network_accounting-system`）を往復とも許可する。

```bash
br="br-$(docker network inspect supabase_network_accounting-system --format '{{.Id}}' | cut -c1-12)"
sudo iptables-legacy -A DOCKER-FORWARD -i "$br" -j ACCEPT
sudo iptables-legacy -A DOCKER-CT -o "$br" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
```

戻り（`RELATED,ESTABLISHED`）が無いと、外向きの SYN だけが出て応答が捨てられ、接続はタイムアウトする。許可したあと同じ `wget` が成功し、上の `curl` のリダイレクト先ホストが `accounts.google.com` になればこの切り分けは終わり。

### 認証エラー

1. **Google Auth Platform の設定を再確認する**
   - **Clients** のリダイレクト URI が `http://127.0.0.1:54321/auth/v1/callback` と `http://localhost:54321/auth/v1/callback` の両方と一致しているか
   - 承認済みの JavaScript 生成元は切り分けに使わない。未設定でもこのアプリのログインには影響しない
   - Audience が External で `Error 403: access_denied` になる場合は、Test users にその Google アカウントが入っているか
   - Google の画面が **Access blocked: Authorization Error** / **The OAuth client was not found.** / `Error 401: invalid_client` のときは、`GOOGLE_CLIENT_ID` がサンプルのプレースホルダのままか、Clients に無い ID である。作成時にダウンロードした JSON のクライアント ID に替え、`yarn supabase stop && yarn supabase start` してからログインし直す

2. **環境変数の確認**
   - `docker exec supabase_auth_accounting-system printenv GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` が `.env.local` の値と一致しているか。`env(GOOGLE_CLIENT_ID)` のままなら、`.env.local` に値を書いて `yarn supabase stop && yarn supabase start` する。シェルに古い `GOOGLE_CLIENT_ID` が export されていると `.env.local` は無視される
   - `.env.local` の `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` が、作成時にダウンロードした JSON の値と一致しているか。シークレットは後から全文を再表示できない
   - アプリが向いている Supabase の URL とキーが、起動しているローカルスタックのものと一致しているか

3. **Supabase の再起動**

   ```bash
   yarn supabase stop && yarn supabase start
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

# 認証コンテナのログ
docker logs supabase_auth_accounting-system

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

### お問い合わせ

開発環境に関する問題や質問があれば、以下にお問い合わせください：

info@future-tech-association.org
