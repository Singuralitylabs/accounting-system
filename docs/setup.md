# 開発環境構築ガイド

## 前提条件

Node.js（v18 以上）、Yarn、Docker Desktop、Git、PostgreSQL クライアント（`psql`）。

## 初期セットアップ

```bash
git clone [リポジトリURL] && cd accounting-system
yarn install
```

### Supabase CLI

CLI は `package.json` の devDependencies にバージョン固定済み（グローバルインストール不要）。直接叩くときは `yarn supabase <サブコマンド>` を使う（以降の `supabase ...` も同様に読み替える）。

ただし `--db-url` に接続文字列を渡すとき（本番 DB を直接指定する場合など）は `yarn` 経由にしないこと。yarn v1 はコマンド行をそのまま表示するため、URL 中のパスワードがログに出る。`npx supabase ...` を使い、パスワードは URL に入れず `PGPASSWORD` で渡す（`docs/release.md` の「読み取り専用ロール」。Issue #195）。

Cloud Agent 向けの `.cursor/setup/supabase-up.sh`（`SUPABASE_CLI_VERSION`）とはバージョンを一致させる。このスクリプトは起動時に、下の「環境変数の設定」と同じ 8 変数だけの `.env.local` を書く。`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `SLACK_WEBHOOK_URL` / `CRON_SECRET` / `PROJECT_ID` は、空でないシェル環境変数、既存の `.env.local`、既定値の順で埋める。`CRON_SECRET` がどちらにも無いときは推測できない値を生成する（固定の既定文字列は書かない）。

---

## Google 認証設定

ローカルの Google ログインは、Supabase Auth が Google へリダイレクトし、認可コードをローカル API（`http://127.0.0.1:54321`）が受け取るサーバサイドフロー。Google 側に必要なのは **承認済みのリダイレクト URI** だけで、JavaScript 生成元は登録しない。

`supabase/config.toml` の `[auth.external.google]` は **ローカルスタック専用**。ホスト版（開発用・本番）の Google プロバイダは Supabase ダッシュボードの **Authentication > Sign In / Providers** で別途設定する（ローカル Studio では Auth Providers のフォームは読み込まれない。ローカルは `config.toml` の `env()` で渡す）。ホスト版の `redirect_uri` は `https://<project-ref>.supabase.co/auth/v1/callback` で、ローカル用 callback とは別なので、クライアント ID / シークレットは流用できない。本番クライアントをローカルに流用できるのは、その承認済みリダイレクト URI にローカルの callback が登録されている場合だけ（未登録だと `Error 400: redirect_uri_mismatch`）。

### 1. Google Auth Platform でクライアントを作る

1. [Google Auth Platform](https://console.cloud.google.com/auth/overview) でプロジェクトを選ぶ／作る。同意画面と OAuth クライアントは **Branding / Audience / Clients / Data Access** で扱う。
2. **Branding**: App name `accounting-system Local`、User support email を設定。**Authorized domains** に `localhost` 等は入れない。スコープ（`openid` / `email` / `profile`）は既定で足りる。
3. **Audience**: `future-tech-association.org` の Workspace 組織配下なら **Internal**。個人アカウント配下は **External** のみで、**Test users** にログインする `@future-tech-association.org` アカウントを追加する（未登録だと `Error 403: access_denied`）。
4. [Clients](https://console.cloud.google.com/auth/clients) で **Create client**: Application type `Web application`、Name `accounting-system Local Dev`、Authorized redirect URIs に次の 2 つ。JavaScript origins は空のまま。

```
http://127.0.0.1:54321/auth/v1/callback
http://localhost:54321/auth/v1/callback
```

### 2. クライアントシークレットの保管

クライアント ID は後から再表示できるが、シークレットはできない。2025 年 6 月以降に作成したクライアント（既存も順次）はハッシュ化され、**作成完了ダイアログの一度しか全文を表示・ダウンロードできない**（以降は末尾 4 文字のみ。紛失時はローテーションで再発行）。JSON をダウンロードしてパスワードマネージャ等に保管してからダイアログを閉じ、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` として次節の `.env.local` に書く。

---

## ローカル Supabase 環境構築

### 1. Docker Desktop を起動する

`supabase init` は実行しない（コミット済みの `supabase/config.toml` を上書きする恐れがある）。

### 2. 環境変数の設定

プロジェクトルートに `.env.local` を新規作成する（テンプレートは同梱していない）。値に空白や特殊文字が含まれる場合はダブルクォートで囲む。

```env
# ローカル Supabase。URL とキーは「Supabase サービスの起動」後に表示された値へ置き換える
# （初回はプレースホルダのままでよい。書き換えたら dev サーバを再起動）。
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-after-supabase-start
SUPABASE_SERVICE_ROLE_KEY=replace-after-supabase-start

# ホスト版 Supabase の Reference ID（yarn db:types / .mcp.json 用）。config.toml の project_id ではない。
PROJECT_ID=your-project-ref

# Google 認証。config.toml の env() が読む。
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Slack 通知。未使用なら空でよい。
SLACK_WEBHOOK_URL=
# 経理用一覧に表示する投稿先チャンネル名（表示専用・任意。例: #経理連絡）。
SLACK_CHANNEL_NAME=

# 事前収支申告リマインド（Vercel Cron）用。ローカルでは任意の値でよい。
CRON_SECRET=your-cron-secret
```

`.env.local` に書くのは次の 8 つ（任意の `SLACK_CHANNEL_NAME` を除く）。

| 変数                            | 参照箇所                                                                         | 取り扱い                                                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `app/utils/supabase/clients.ts`、`middleware.ts`                                 | ローカルは `http://127.0.0.1:54321`。ホスト版は `https://<project-ref>.supabase.co`                                                                                                                                                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上                                                                             | 低権限のキー。公開リポジトリや共有ドキュメントに値を書かない                                                                                                                                                                                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | `createServiceRoleSupabase`（`app/utils/supabase/clients.ts`）                   | RLS をバイパスする。サーバ側のみ。本アプリでは `app/api/cron/budget-declaration-reminder/route.ts` の読み取りにだけ使うが、キー自体の権限はそれに限定されない                                                                                      |
| `PROJECT_ID`                    | `package.json` の `db:types`、`.mcp.json`                                        | 公開可能な project ref。`config.toml` の `project_id` とは別物                                                                                                                                                                                     |
| `GOOGLE_CLIENT_ID`              | `supabase/config.toml` の `env(GOOGLE_CLIENT_ID)`                                | ローカル Supabase 専用                                                                                                                                                                                                                             |
| `GOOGLE_CLIENT_SECRET`          | `supabase/config.toml` の `env(GOOGLE_CLIENT_SECRET)`                            | 秘匿。ローカル Supabase 専用                                                                                                                                                                                                                       |
| `SLACK_WEBHOOK_URL`             | `app/actions/slack/index.ts`、`app/utils/slack/sendBudgetDeclarationReminder.ts` | 秘匿。投稿先チャンネルはこの Webhook で決まる。チャンネルを変えるときは Slack で新しい Webhook を作成し、本番の環境変数を差し替えて再デプロイする（画面からは変更できない）。表示用の `SLACK_CHANNEL_NAME` も合わせて更新する                      |
| `SLACK_CHANNEL_NAME`            | `app/components/dynamic/DynamicAccounting.tsx`                                   | 表示専用・任意。経理用一覧の「担当者に連絡」に出す投稿先チャンネル名（例: `#経理連絡`）。実際の投稿先は `SLACK_WEBHOOK_URL` の Webhook で決まり、この値は影響しない。未設定なら表示しない。クライアントには露出しない（`NEXT_PUBLIC_` を付けない） |
| `CRON_SECRET`                   | `app/api/cron/budget-declaration-reminder/route.ts`                              | 秘匿。第三者に知られると cron エンドポイントを叩ける                                                                                                                                                                                               |

次の名前は `.env.local` に書かない: `NEXT_PUBLIC_ENV`（未使用）、`SUPABASE_URL`（アプリは参照しない。keep-alive ジョブ内の環境変数名で、Secret 名は `KEEPALIVE_SUPABASE_URL_DEV` / `_PROD`）、`LOCAL_DB_URL`（未使用）、`VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL`（Vercel が本番ランタイムに注入。申告ページ URL の組み立て用）、`ANALYZE`（`ANALYZE=true yarn build` のときだけバンドル分析）。

`config.toml` の `env(...)` は、Supabase CLI 2.115 が ①CLI を起動したシェルの環境変数、②ファイル（`supabase/` ディレクトリ → プロジェクトルートの順に、`.env.development.local`、`.env.local`、`.env.development`、`.env`）の順で解決する。通常はルートの `.env.local` に書いて `yarn supabase start` すればよい。シェルや `supabase/.env.local` に空でない値が残っているとルートの `.env.local` は使われない。どちらにも値が無いと置換されず、認証コンテナのクライアント ID が文字列 `env(GOOGLE_CLIENT_ID)` のままになる（警告は出ない）。起動後に次で確認する。

```bash
docker exec supabase_auth_accounting-system printenv GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID
```

`.env.local` の `GOOGLE_CLIENT_ID` と一致していればよい。

### 3. Supabase サービスの起動

```bash
yarn supabase start
```

起動後、`yarn supabase status` の Pretty 表示で `.env.local` の 3 つを書き換える: Project URL → `NEXT_PUBLIC_SUPABASE_URL`、Publishable → `NEXT_PUBLIC_SUPABASE_ANON_KEY`、Secret → `SUPABASE_SERVICE_ROLE_KEY`。`-o env` の JWT（`ANON_KEY` / `SERVICE_ROLE_KEY`）でも動く。変数名は変えない。ホスト版ダッシュボードの publishable / secret key、Legacy の JWT も同じ変数に入れられる。キーの値はドキュメントに書かない。

### 4. スキーマの適用

スキーマの正は `supabase/migrations/`。適用されるのは **初回の `supabase start`（ボリューム新規作成時）** と **`supabase db reset`** のみで、既存ボリュームに対する `supabase start` では追加分は適用されない。既存のローカル DB を合わせるには `supabase db reset`（ファイル名順に全適用。選択肢マスタの初期データも含む）。案件・取引先・コストのサンプル行は無いので、ログイン後に画面から作成する。

### 5. 開発サーバーの起動

```bash
yarn dev   # http://localhost:3000
```

`NEXT_PUBLIC_*` は起動時に埋め込まれる。`NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` を変えたら dev サーバを止めて再起動する（しないと変更前の接続先、たとえば本番に繋がり続ける）。

### 開発用エンドポイント

Studio `http://127.0.0.1:54323` / API `http://127.0.0.1:54321` / PostgreSQL `postgresql://postgres:postgres@127.0.0.1:54322/postgres` / Inbucket（メール）`http://127.0.0.1:54324`。ログは `docker logs supabase_db_accounting-system` / `supabase_auth_accounting-system`（`supabase logs` は CLI 2.115 に無い）。DB バックアップは `pg_dump`。

ログインできるのは `@future-tech-association.org` のみ。判定は `app/utils/constants.ts` の `isAllowedEmailDomain`、強制は `app/auth/callback/route.ts`（ログインボタン側のチェックは UX 用で、そこだけ変えてもコールバックが拒否する）。

その他のコマンドは `CLAUDE.md` を参照。スキーマ変更後は `yarn -s db:types-local > /tmp/generated.ts`（本番から生成する場合のみ `yarn -s db:types`）で生成結果を標準出力に出し、`app/lib/database.types.ts` との差分から必要な部分だけを手で反映する（このファイルは手で保つ。上書きしない。詳細は `CLAUDE.md`）。

---

## データ移行

### ローカル → クラウド

```bash
supabase db dump --local -f schema.sql             # スキーマのみ（既定）
supabase db dump --local --data-only -f data.sql   # データのみ
```

`--local` を付けないとリンク済みリモートをダンプしようとし、未リンクだと `Cannot find project ref` で失敗する。

**ホスト版への切り替え**: `.env.local` の `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` は **3 つセットで** 切り替える（一部だけだと、ブラウザ用クライアントと cron ルートが別プロジェクトを向く）。ホスト版を使う間はローカルの 3 行をコメントアウトし、戻すときは逆にする。`PROJECT_ID` は接続先と独立。切り替え後は dev サーバを再起動する。

- Project URL は `https://<project-ref>.supabase.co`。画面では **Project Settings > Integrations > Data API** に出る。
- キーは **Project Settings > API Keys**（`/settings/api-keys`）。既定タブは publishable / secret key、JWT 形式は **Legacy anon, service_role API keys** タブ。
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` はローカルの `config.toml` 専用で、ホスト版の Google ログインには効かない。

**スキーマ適用とデータ投入**:

```bash
supabase link --project-ref [your-project-id]
supabase db push
psql "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" < data.sql   # 接続 URI は Connect ダイアログの値
```

アプリが新しい RPC / テーブルを参照するリリースより **先に**（または同時に）マイグレーションを適用すること。未適用だと PostgREST は `PGRST202` を返す（例: migration 21 の `get_member_options()`）。

### クラウド → ローカル

```bash
supabase link --project-ref <project-ref>
supabase db pull      # リモートのスキーマを新しいマイグレーションとして保存（行データは含まない）
supabase db reset
supabase db dump --linked --data-only -f data.sql   # 行データが必要な場合
```

`.env.local` をローカルの値に戻したら dev サーバを再起動する。

---

## Supabase keep-alive（自動 Pause 対策）

Supabase 無料プランは 1 週間アクセスが無いとプロジェクトが自動 Pause されるため、`.github/workflows/supabase-keepalive.yml`（GitHub Actions、毎日 06:17 JST）が開発用・本番用の両 Supabase に anon key で軽い SELECT を送って Pause を防いでいる（Issue #125）。仕組みや注意事項はワークフロー冒頭のコメントを参照。

### 必要な GitHub Secrets

リポジトリの **Settings > Secrets and variables > Actions > Repository secrets** に以下の 4 つを登録する。未設定だと該当ジョブは「Secrets が未設定」で fail する。

| Secret 名                          | 値                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `KEEPALIVE_SUPABASE_URL_DEV`       | 開発用 Supabase の API URL（`https://<project-ref>.supabase.co`）                |
| `KEEPALIVE_SUPABASE_ANON_KEY_DEV`  | 開発用 Supabase の anon key（アプリの `NEXT_PUBLIC_SUPABASE_ANON_KEY` と同じ値） |
| `KEEPALIVE_SUPABASE_URL_PROD`      | 本番用 Supabase の API URL                                                       |
| `KEEPALIVE_SUPABASE_ANON_KEY_PROD` | 本番用 Supabase の anon key                                                      |

- Secret 名は `.env.local` の変数名と一致しない（URL 用は `SUPABASE_URL` ではない。ジョブ内で `SUPABASE_URL` に展開しているだけ）。
- URL は `https://` 付きで登録する（末尾スラッシュや前後の空白は無視。形式不正は「URL 形式が不正」で fail）。
- キーは **Project Settings > API Keys** の **Legacy anon, service_role API keys** タブの JWT 形式 anon key（`eyJ...`）を第一候補にする。ワークフローは `apikey` と `Authorization: Bearer` に同じ値を載せる。publishable key（`sb_publishable_...`）は JWT ではないためホスト版で `Invalid JWT` になることがある（200 が返る場合のみ使ってよい）。
- キーをローテーションしたら Secrets も差し替え、手動実行で 200 を確認する。

### 動作確認（手動実行）

1. **Actions > Supabase Keep-Alive > Run workflow** で `main` を選んで実行する（ワークフローが `main` に存在して初めて表示されるため、main へのマージ後に行う）。
2. `keep-alive (dev)` / `keep-alive (prod)` が成功し、ログに `[dev] OK: HTTP 200` / `[prod] OK: HTTP 200` が出ていることを確認する。以降は Actions の実行履歴（`schedule`）で確認できる。

すでに Pause している場合は、先にダッシュボードで対象プロジェクトを **Restore** してから実行する（Pause 中は DNS が消えていて fail する）。

### 停止手順

- **一時停止**: **Actions > Supabase Keep-Alive > ⋯ > Disable workflow**（再開は **Enable workflow**）。
- **恒久廃止**（Pro プラン移行など）: `.github/workflows/supabase-keepalive.yml` を削除して main にマージし、上記 4 つの Secrets も削除する。

---

## 本番リリース

手順は [`docs/release.md`](./release.md)。本番 DB へのマイグレーション適用（`supabase db push`）は手動で行う（ワークフローは実行しない）。

---

## トラブルシューティング

### project_id 変更後のローカル再起動

`supabase/config.toml` の `project_id` が変わるとコンテナ／ボリューム名も変わる。旧スタックがポート 54321〜54324 を掴んだままだと `supabase start` は `port is already allocated` で失敗する。

```bash
supabase stop                                   # pull 前なら
supabase stop --project-id matter-controller    # pull 済みで旧スタックが残る場合
supabase start
```

新規ボリュームにはマイグレーションが適用されるため `db reset` は不要。旧ボリューム（例: `supabase_db_matter-controller`）のローカルデータは新スタックから見えず、ディスクに残る（本番には影響なし。不要なら `docker volume ls` で確認して削除）。`.cursor/setup/supabase-up.sh` は旧 `project_id` のスタックを自動で stop してから start する。

### Docker / DB 接続 / スキーマのエラー

Docker 未起動なら起動する。`docker ps` で状態確認、`supabase stop && supabase start` で再起動。DB 接続は `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "SELECT version();"` で確認。スキーマ不整合は `supabase db reset`。型は `app/lib/database.types.ts` を手で保つ（再生成して上書きしない）。

### `yarn dev` が App Router と無関係なエラーで落ちる

`node_modules` が無いと yarn が PATH 上のグローバル `next` にフォールバックすることがある。スタックトレースが `/usr/local/lib/node_modules/next` で「The `app` directory is experimental」と出たら、`yarn install` してから `npm uninstall -g next` する。

### ローカル Supabase を起動しているのに本番へ繋がる

`.env.local` の `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` がホスト版のままだとアプリはホスト版に接続する（ローカルの Google クライアント設定も効かない）。ローカルの値（`http://127.0.0.1:54321` とそのスタックのキー）に戻し、cron ルート用に `SUPABASE_SERVICE_ROLE_KEY` も同じスタックの値に揃え、dev サーバを再起動する。切り分けにはローカル Auth の Google への redirect 先を見る（`accounts.google.com` になれば正常）。

```bash
curl -s -o /dev/null -w "%{redirect_url}\n" "http://127.0.0.1:54321/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback"
```

### 認証コンテナから Google へ届かない

上の `curl` が `504`（`context deadline exceeded`）のとき、GoTrue が `accounts.google.com` へ届いていない。ホストからは開けるのにコンテナからだけ失敗するなら、Supabase 用 Docker bridge の転送がホストの firewall で落ちている。

```bash
docker exec supabase_auth_accounting-system wget -q -O /dev/null -T 10 https://accounts.google.com/
```

終了コード 0 なら到達している。届かず、`sudo iptables-legacy -L FORWARD` の policy が `DROP` で許可が `docker0` だけなら、Supabase の bridge を往復とも許可する（一時的な回避。Docker 28 以降の `DOCKER-FORWARD` / `DOCKER-CT` + `iptables-legacy` で確認。nft バックエンドでは nft 側のルールになる。Docker デーモンの再起動・更新でルールは消えるので、消えたら再実行する）。

```bash
br="br-$(docker network inspect supabase_network_accounting-system --format '{{.Id}}' | cut -c1-12)"
sudo iptables-legacy -A DOCKER-FORWARD -i "$br" -j ACCEPT
sudo iptables-legacy -A DOCKER-CT -o "$br" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
```

戻り（`RELATED,ESTABLISHED`）が無いと応答が捨てられて接続がタイムアウトする。許可後に同じ `wget` が成功し、`curl` の redirect 先が `accounts.google.com` になれば完了。

### 認証エラー

1. **Google Auth Platform の設定**
   - **Clients** のリダイレクト URI が上記 2 つ（`127.0.0.1` / `localhost`）と一致しているか。JavaScript 生成元は切り分けに使わない
   - External で `Error 403: access_denied` → Test users にそのアカウントが入っているか
   - **The OAuth client was not found.** / `Error 401: invalid_client` → `GOOGLE_CLIENT_ID` がプレースホルダか、Clients に無い ID。JSON の値に替え、`yarn supabase stop && yarn supabase start` してやり直す
   - **Sign in / to continue to <アプリ名>** が出ていれば、クライアント ID と `redirect_uri` は受理済み（この手順のクライアントなら `accounting-system Local`、本番クライアントなら「シンラボ経理システム」）。次は `@future-tech-association.org` でサインインする。コード交換には同じクライアントの `GOOGLE_CLIENT_SECRET` が必要
2. **環境変数**: 上記 `printenv` が `.env.local` と一致するか（`env(GOOGLE_CLIENT_ID)` のままなら `.env.local` に書いて再起動。シェルに古い値が export されていると `.env.local` は無視される）。`GOOGLE_CLIENT_ID` / `_SECRET` が JSON の値と一致するか。アプリの Supabase URL / キーが起動中のローカルスタックのものか
3. `yarn supabase stop && yarn supabase start`

### ポートが使用中

`lsof -i :3000`（Next.js）/ `:54321`（API）/ `:54322`（PostgreSQL）で確認して終了するか、`yarn dev --port 3001` を使う。

---

## 開発時の注意

- 機密情報を Git にコミットしない（`.env.local` は gitignore 済み）。
- ローカルデータは `supabase stop` 後も Docker ボリュームに残る。重要なデータ変更前はバックアップを取る。
- 開発は本番に影響しないローカル環境で行う。PR 作成前にローカルでテストを通す。新機能は先に issue で議論する。

関連ドキュメント: [`database.md`](./database.md) / [`specification.md`](./specification.md)。開発環境の問い合わせ: info@future-tech-association.org
