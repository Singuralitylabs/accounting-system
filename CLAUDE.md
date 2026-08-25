# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コマンド

```bash
yarn dev              # 開発サーバ起動
yarn build            # 本番ビルド
yarn lint             # ESLint（no-console / no-debugger 検知を含む）
yarn typecheck        # tsc --noEmit
yarn test             # Vitest（ユニットテスト）
yarn test:watch       # Vitest watch モード
yarn format           # Prettier 適用
yarn format:check     # Prettier チェック

yarn db:types         # 本番 Supabase からの型生成（.env.local の PROJECT_ID を参照）
yarn db:types-local   # ローカル Supabase からの型生成

supabase start | stop | reset   # ローカル Supabase の起動・停止・リセット（reset で supabase/migrations/ を再適用）
```

- スキーマ変更後は `yarn db:types-local` を必ず実行し `app/lib/database.types.ts` を更新する。
- スキーマ変更（テーブル / RLS / トリガー / enum / 初期データなど）は **必ず `supabase/migrations/` に SQL ファイルとして追加する**。命名は `YYYYMMDDHHMMSS_<snake_case_name>.sql`。リモートに直接当てた変更も後追いで同形式のファイルを追加し、ローカルから `supabase db reset` で同じ状態を再現できる状態を維持する。
- マイグレーションを足したら同じ PR で `docs/database.md` も更新する（テーブル定義 / RLS / トリガーの記載と実物を一致させる）。
- テストは Vitest（`tests/` 配下、`*.test.ts` 統一、TZ=Asia/Tokyo 固定）。方針・対象・規約は `docs/testing.md` を参照。テスト済みコードを修正したら対応するテストも更新する。
- CI は GitHub Actions（`.github/workflows/`: typecheck+lint / test / build / format-check）。

## 作業ルール

- 作業ブランチへの commit / push は確認不要。ただし **push 前に `yarn typecheck && yarn lint && yarn test && yarn build && yarn format:check` をローカルで通すこと**。
- `main` へ直接 push しない。変更は作業ブランチ＋PR を経由する。
- PR のマージはユーザーが判断する。CI green ＋レビュー完了までが担当範囲。

## アーキテクチャ

- Next.js 14 (App Router) / TypeScript / Mantine + Tailwind
- 認証は Supabase Auth + Google OAuth。`@future-tech-association.org` ドメイン限定。
- 認証・DB アクセスは `@supabase/ssr`（`createServerClient` / `createBrowserClient`）を使う。生成は `app/utils/supabase/clients.ts` の `createServerSupabase()` と `SupabaseProvider` の `createBrowserClient` に集約する。middleware は同じ `@supabase/ssr` の `createServerClient` と request cookies。**`@supabase/auth-helpers-nextjs` は使用禁止**（ESLint `no-restricted-imports`）。Cookie 形式が異なるため、旧 auth-helpers クライアントを混在させるとセッションを読めず、RLS で全クエリが 0 行になる（エラーは出ない）。
- `app/layout.tsx` で `export const dynamic = "force-dynamic"` を指定しており、ページは静的キャッシュされない。

### Provider スタック（`app/layout.tsx`）

`SupabaseProvider` → `QueryProvider` → `MantineProvider` → `DatesLocaleProvider` → `AuthProvider`

（日付 UI は `@mantine/dates`。ロケールは `DatesLocaleProvider`、入力は `CustomDatePicker` / `CustomMonthPicker` 経由。layout に日付ピッカー本体を置かない）

### 状態管理

- **マスタデータ**: `app/atoms/optionsAtom.ts`（Jotai）。`InitialOptionalLoader` が初回にハイドレート。
- **サーバ状態**: `app/hooks/useMatterData.ts` の TanStack Query フック（`useUserMatterList` / `useAllMatterList` / `useMatterDetail` ＋ ミューテーション）。Server Component から `initialData` でキャッシュを温める。
- **フォーム**: `@mantine/form`。

### データアクセス

- DB ヘルパは `app/utils/supabase/*`（`addMatterInfo` / `editMatterInfo` / `deleteMatter` / `checkMatterInfoList` / `updateProfile` / `supabaseServer` など）。Server Component から直接呼ぶか、TanStack Query フック経由で呼ぶ。
- `app/actions/` は現状 Slack 通知アクションを再エクスポートしているだけ。新規 Server Action を足すならここ。
- RLS が有効なので、すべての DB 操作は RLS を前提に書く。

### 認可（`middleware.ts`）

ロールは `profiles.class` カラムに格納：`public` / `teamleader` / `accounting` / `admin`。

ルートごとの閲覧許可ロールは `app/utils/permissions.ts` の `ROUTE_PERMISSIONS` が単一の定義（`/team` / `/accounting` / `/profit-loss` / `/recurring-costs` / `/extra-entries` / `/dashboard`）。`/`, `/new`, `/matters` はロール制限なし（ログイン必須）。権限クラス×ページの手動確認表は `docs/testing.md` の「3.7 手動確認（RLS・権限クラス別）」を参照。

- middleware は `getUser()`（Supabase Auth サーバでアクセストークンの署名・有効性を検証する）で認証を確認する。`getSession()` はローカル Cookie の値をそのまま返すだけで署名検証を行わないため、認証の可否判定には使わない（偽造 Cookie による認証バイパスを防ぐ）。
- 制限ルートのロールは、`getUser()` で検証済みの同一アクセストークンから読む JWT の `user_class` クレームを使う（`profiles` への DB クエリを排除）。`user_class` は Custom Access Token Hook（`public.custom_access_token_hook`、`docs/database.md` 参照）が付与する。クレームは同じ検証済みトークンの一部であるため、改ざんされていればトークンの署名検証自体が失敗し `getUser()` がエラーになる。
- `user_class` クレームが有効な文字列でない場合（クレームキー自体が無い / 値が明示的に `null` / 空文字 / 文字列以外）は `profiles` への DB クエリにフォールバックするため、フック未有効化でも動作する（フェイルセーフ）。**本番では Supabase ダッシュボードでフックを有効化する必要がある**（マイグレーション適用後に有効化すること。適用前に有効化すると全ユーザーがログインできなくなる）。新規ユーザーはトークン発行後にプロフィールが作成されるため初回トークンは必ず `user_class: null` になるが、この場合もフォールバックするため直後のロール付与は即座に反映される。
- ロール変更は対象ユーザーのトークンリフレッシュ（既定で最大約1時間）または再ログインまで JWT に反映されない（JWT にロールが既に載っている場合のみ）。即時反映が必要な用途では middleware だけに依存しないこと。
- `getUser()` が Supabase Auth 側の一時的障害（fetch 自体の失敗、またはステータス 5xx）を返した場合、middleware はログイン中ユーザーを一律 `/login` に飛ばさず 503 を返す（一時的障害と偽造トークンを区別する）。auth-js の `isAuthRetryableFetchError` は 502/503/504 しか拾わず 500 は `AuthApiError` になるため、判定には 5xx の `AuthApiError` も含める必要がある（`app/utils/routeGuard.ts` の `isTransientAuthError`）。

## 業務ロジック

未来技術推進協会の案件管理システム（日本語 UI、JST、円表記）。

- **案件ライフサイクル**: 下書き → 経理申請中 → 経理確認完了 → 完了
- **金額**: `business`（売上）と `costs`（費用）を案件ごとに紐付け
- **チーム**: チームリーダーは自チームの全案件を閲覧可
- **差し戻し検知**: 経理申請後に編集されると経理側でハイライト表示
- **通知**: 案件担当者に Slack で通知

## 主要ファイル

- `middleware.ts` — ルート保護 & ロール判定（判定ロジックは `app/utils/routeGuard.ts`。`matchesRoute` は `permissions.ts`）
- `app/layout.tsx` — Provider スタック / `force-dynamic`
- `app/components/providers/` — `SupabaseProvider`, `QueryProvider`, `DatesLocaleProvider`, `InitialOptionalLoader`
- `app/utils/matterCalc.ts` / `app/utils/matterValidation.ts` — 案件の金額集計と必須・日付バリデーション
- `app/utils/supabase/editMatterInfo.ts` — 案件 CRUD のコア
- `app/hooks/useMatterData.ts` — TanStack Query フック群
- `app/actions/slack/` — Slack 通知 Server Action
- `docs/setup.md` / `docs/specification.md` / `docs/database.md` / `docs/testing.md` — セットアップ・仕様・DB 設計・テスト設計（手動確認の手順は testing.md 3.7）
