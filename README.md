# 案件管理アプリケーション

![FutureTech Logo](/public/futuretech_logo.svg)

## アプリケーション概要

本アプリケーションは、未来技術推進協会のための案件管理システムです。案件の作成から経理申請、確認までの一連のフローをウェブアプリケーションで効率化します。

案件管理アプリ（未来技術推進協会のドメイン以外はログイン不可）

https://matter-controller.vercel.app/

## 主な機能

### 📋 案件管理

- 案件情報の登録・編集・削除
- 案件のコピー作成
- 案件の経理申請
- 経理申請後の更新
- 関連案件の管理（親子関係）

### 💼 取引先管理

- 取引先情報の登録・編集
- 取引先ごとの報酬額管理
- 請求日・振込期限の管理

### 💰 コスト管理

- コスト情報の登録・編集
- 支払い先・支払い期限の管理
- 源泉徴収の有無の設定

### 📊 経理処理

- 案件一覧の確認
- 取引先の確認完了チェック
- コストの支払い完了チェック
- 案件の完了処理
- 申請後に更新された案件の確認

### 📢 通知機能

- Slack による案件担当者への通知

### 👥 ユーザー管理

- ユーザー権限の設定
- Slack ID の登録

### 👁️ チーム管理

- チームリーダーによるチーム案件の一覧表示
- チーム全体の収支管理

## 利用の流れ

### 一般ユーザー向け

1. **ログイン**

   - Google 認証で未来技術推進協会のアカウントでログインします

2. **案件作成**

   - 「新規作成」から案件を登録します
   - 基本情報（案件名、分類、チーム、案件開始日、説明）を入力します
   - 必要に応じて親案件を選択します（関連案件の管理）
   - 取引先情報（取引先からの報酬）を必要に応じて登録します
   - コスト情報（案件に関わる支出）を必要に応じて登録します

3. **案件の管理**

   - トップページで自分の案件一覧を確認できます
   - カード表示とテーブル表示を切り替えられます
   - 案件をクリックして詳細を確認・編集できます
   - 関連案件がある場合は親子関係を確認できます

4. **経理申請**
   - 案件情報入力後、「経理申請」ボタンで経理担当者に申請します
   - 売上金額が 0 円の場合は確認のアラートが表示されます
   - 申請後も編集が可能です（更新内容は経理担当者に通知されます）

### チームリーダー向け

1. **チーム案件確認**
   - 「チーム案件」で自身のチームの案件一覧を確認できます
   - チーム全体の収支を確認できます
   - 各担当者の案件状況を確認できます

### 経理担当者向け

1. **案件確認**

   - 「経理用一覧」で全ユーザーの案件を確認できます
   - フィルターを使って特定の条件の案件を絞り込めます
   - 申請後に更新された案件はハイライト表示されます

2. **案件の詳細確認・承認**

   - 取引先情報の確認チェック
   - コスト情報の支払い完了チェック
   - 経理メモの追加
   - 申請後の更新内容の確認
   - 案件の完了処理

3. **担当者への通知**
   - 確認事項があれば、Slack で担当者に通知できます
   - 通知すると案件は下書き状態に戻り、担当者が再編集できるようになります

### 管理者向け

1. **ユーザー管理**

   - ユーザーの権限設定（一般/チームリーダー/経理担当者/管理者）
   - Slack ID の設定

2. **マスタデータ管理**
   - チーム、分類、品目などの選択肢を編集できます

## 用語説明

- **案件**: 協会が取り組むプロジェクトや業務
- **取引先**: 案件に関連する外部企業や個人（協会への支払元）
- **コスト**: 案件に関わる支出（協会からの支払先）
- **下書き**: 経理申請前の編集可能な状態
- **経理申請中**: 経理担当者の確認待ち状態
- **経理確認完了**: 経理担当者が確認完了した状態

## 権限について

- **一般ユーザー**: 自分の案件の作成・管理ができます
- **経理担当者**: 全ての案件を確認・編集できます
- **管理者**: 全ての機能を利用できます（ユーザー管理含む）

## 開発者向け情報

本アプリケーションは以下の技術を使用しています：

- Next.js（React フレームワーク）
- TypeScript
- Tailwind CSS、Mantine UI（デザインシステム）
- Supabase（データベース・認証）

開発環境のセットアップや詳細な技術情報については、[docs/](./docs/) ディレクトリの各種設計書をご参照ください。

## 📦 ローカル開発環境セットアップ

### 前提条件

以下のソフトウェアがインストールされている必要があります：

- [Node.js](https://nodejs.org/) (v18 以上推奨)
- [Yarn](https://yarnpkg.com/) または npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Git](https://git-scm.com/)

### 🚀 セットアップ手順

#### 1. リポジトリのクローン

```bash
git clone [リポジトリURL]
cd matter-controller
```

#### 2. 依存関係のインストール

```bash
yarn install
# または
npm install
```

#### 3. Supabase CLI のインストール

```bash
# Homebrewを使用（macOS）
brew install supabase/tap/supabase

# その他のインストール方法は公式ドキュメントを参照
# https://supabase.com/docs/guides/cli/getting-started
```

#### 4. Google Cloud Console 設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成または既存プロジェクトを選択
3. **APIs & Services > OAuth consent screen** で設定：
   - User Type: `External`を選択
   - Application name: 適切な名前を入力
   - Authorized domains: `127.0.0.1`, `localhost`を追加
4. **APIs & Services > Credentials** で OAuth 2.0 クライアント ID を作成：
   - Application type: `Web application`
   - Authorized JavaScript origins:
     ```
     http://localhost:3000
     http://127.0.0.1:3000
     ```
   - Authorized redirect URIs:
     ```
     http://127.0.0.1:54321/auth/v1/callback
     http://localhost:54321/auth/v1/callback
     ```

#### 5. 環境変数の設定

**まず次のステップで Supabase を起動**してから、`.env.local`ファイルを下記の通り編集してください：

```env
# ローカル開発環境のSupabase設定
NEXT_PUBLIC_ENV=development
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=[supabase start実行後に表示されるanon key]
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=[supabase start実行後に表示されるservice_role key]
PROJECT_ID=matter-controller
LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Google認証設定（Google Cloud Consoleで取得した値に置き換え）
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Slack設定（必要に応じて）
SLACK_WEBHOOK_URL=your-slack-webhook-url
```

#### 6. ローカル Supabase の起動とデータベース初期化

```bash
# Docker Desktopを起動（まだ起動していない場合）
open -a Docker

# Supabaseローカル環境を初期化（初回のみ）
supabase init

# Supabaseサービスを起動
supabase start
```

**重要**: `supabase start`実行後に表示される情報をメモしてください：

```bash
         API URL: http://127.0.0.1:54321
        anon key: eyJhbGciOiJIUzI1NiIs... # これをNEXT_PUBLIC_SUPABASE_ANON_KEYに設定
service_role key: eyJhbGciOiJIUzI1NiIs... # これをSUPABASE_SERVICE_ROLE_KEYに設定
```

この情報を使って前のステップで作成した`.env.local`ファイルの対応する値を更新してください。

```bash

# データベーススキーマを作成
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f app/db/00_config.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f app/db/01_profiles.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f app/db/02_matters.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f app/db/03_costs.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f app/db/04_business.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f app/db/05_select_options.sql
```

#### 7. 開発サーバーの起動

```bash
yarn dev
# または
npm run dev
```

アプリケーションが http://localhost:3000 で起動します。

### 🔧 ローカル環境の詳細情報

#### 利用可能なエンドポイント

- **アプリケーション**: http://localhost:3000
- **Supabase Studio**: http://127.0.0.1:54323 （データベース管理画面）
- **Supabase API**: http://127.0.0.1:54321
- **PostgreSQL**: postgresql://postgres:postgres@127.0.0.1:54322/postgres
- **Inbucket（メールテスト）**: http://127.0.0.1:54324

#### 開発に便利なコマンド

```bash
# Supabaseの状態確認
supabase status

# Supabaseの停止
supabase stop

# データベーステーブル一覧
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\dt"

# 型定義の更新（スキーマ変更時）
yarn db:types
```

### 🔐 認証について

- ローカル環境では`future-tech-association.org`ドメインの Google アカウントのみログイン可能です
- テスト時にドメイン制限を無効化したい場合は、`app/components/auth/auth-components.tsx`の`isAllowedDomain`関数を一時的に`return true;`に変更してください

### 🐛 トラブルシューティング

#### Docker 関連のエラー

```bash
# Dockerが起動していない場合
open -a Docker

# Dockerコンテナの状態確認
docker ps

# Supabaseコンテナの再起動
supabase stop && supabase start
```

#### データベース接続エラー

```bash
# データベース接続確認
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "SELECT version();"

# テーブル確認
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\dt"
```

#### 認証エラー

1. Google Cloud Console の設定を再確認
2. `.env.local`の`GOOGLE_CLIENT_ID`と`GOOGLE_CLIENT_SECRET`が正しいか確認
3. Supabase を再起動：`supabase stop && supabase start`

### 📝 開発時の注意事項

- ローカル環境のデータは`supabase stop`時に Docker ボリュームに保存されます
- スキーマ変更後は型定義を更新してください：`yarn db:types`
- プロダクション環境への影響を避けるため、ローカル環境のみで開発してください

## お問い合わせ

本アプリケーションに関するお問い合わせは、下記までお願いいたします。

info@future-tech-association.org
