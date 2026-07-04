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
yarn db:seed          # scripts/seed-dev-data.sql を流す（※このファイルはリポジトリに含まれない）

supabase start | stop | reset   # ローカル Supabase の起動・停止・リセット
```

- スキーマ変更後は `yarn db:types-local` を必ず実行し `app/lib/database.types.ts` を更新する。
- スキーマ変更（テーブル / RLS / トリガー / enum / 初期データなど）は **必ず `supabase/migrations/` に SQL ファイルとして追加する**。命名は `YYYYMMDDHHMMSS_<snake_case_name>.sql`。リモートに直接当てた変更も後追いで同形式のファイルを追加し、ローカルから `supabase db reset` で同じ状態を再現できる状態を維持する。
- マイグレーションを足したら同じ PR で `docs/database.md` も更新する（テーブル定義 / RLS / トリガーの記載と実物を一致させる）。
- テストは Vitest（`tests/` 配下、`*.test.ts` 統一、TZ=Asia/Tokyo 固定）。方針・対象・規約は `docs/testing.md` を参照。テスト済みコードを修正したら対応するテストも更新する。
- CI は GitHub Actions（`.github/workflows/`: typecheck+lint / test / build / format-check）。

## 作業ルール

- **ファイルを修正したら、コミットする前に必ずユーザーに確認を取る**。確認なしで `git commit` / `git push` を実行しない。

## アーキテクチャ

- Next.js 14 (App Router) / TypeScript / Mantine + Tailwind
- 認証は Supabase Auth + Google OAuth。`@future-tech-association.org` ドメイン限定。
- 認証・DB アクセスは全面的に `@supabase/auth-helpers-nextjs` を使用。`@supabase/ssr` は依存に入っているが**未使用**であり、セッション Cookie が auth-helpers 形式のため **`@supabase/ssr` クライアントを混在させるとセッションを読めず、RLS で全クエリが 0 行になる**（エラーは出ない）。認証スタック全体を `@supabase/ssr` へ移行するまでは、新規コードも `createServerComponentClient` 等の auth-helpers を使うこと。
- `app/layout.tsx` で `export const dynamic = "force-dynamic"` を指定しており、ページは静的キャッシュされない。

### Provider スタック（`app/layout.tsx`）

`SupabaseProvider` → `QueryProvider` → `MantineProvider` → `AuthProvider`

（react-datepicker の日本語ロケール登録は `app/components/datePickerLocale.ts` を各ピッカーが side-effect import する方式。layout には置かない — バンドルが全ページに乗るため）

### 状態管理

- **マスタデータ**: `app/atoms/optionsAtom.ts`（Jotai）。`InitialOptionalLoader` が初回にハイドレート。
- **サーバ状態**: `app/hooks/useMatterData.ts` の TanStack Query フック（`useUserMatterList` / `useAllMatterList` / `useTeamMatterList` ＋ ミューテーション）。Server Component から `initialData` でキャッシュを温める。
- **フォーム**: `@mantine/form`。

### データアクセス

- DB ヘルパは `app/utils/supabase/*.tsx`（`addMatterInfo` / `editMatterInfo` / `deleteMatter` / `checkMatterInfoList` / `updateProfile` / `supabaseServer`）。Server Component から直接呼ぶか、TanStack Query フック経由で呼ぶ。
- `app/actions/` は現状 Slack 通知アクションを再エクスポートしているだけ。新規 Server Action を足すならここ。
- RLS が有効なので、すべての DB 操作は RLS を前提に書く。

### 認可（`middleware.ts`）

ロールは `profiles.class` カラムに格納：`public` / `teamleader` / `accounting` / `admin`。

| パス          | 要件                        |
| ------------- | --------------------------- |
| `/`, `/new`   | ログイン必須                |
| `/team`       | `teamleader` または `admin` |
| `/accounting` | `accounting` または `admin` |
| `/dashboard`  | `admin` のみ                |

## 業務ロジック

未来技術推進協会の案件管理システム（日本語 UI、JST、円表記）。

- **案件ライフサイクル**: 下書き → 経理申請中 → 経理確認完了 → 完了
- **金額**: `business`（売上）と `costs`（費用）を案件ごとに紐付け
- **チーム**: チームリーダーは自チームの全案件を閲覧可
- **差し戻し検知**: 経理申請後に編集されると経理側でハイライト表示
- **通知**: 案件担当者に Slack で通知

## 主要ファイル

- `middleware.ts` — ルート保護 & ロール判定
- `app/layout.tsx` — Provider スタック / `force-dynamic`
- `app/components/providers/` — `SupabaseProvider`, `QueryProvider`, `InitialOptionalLoader`
- `app/utils/supabase/editMatterInfo.tsx` — 案件 CRUD のコア
- `app/hooks/useMatterData.ts` — TanStack Query フック群
- `app/actions/slack/` — Slack 通知 Server Action
- `docs/setup.md` / `docs/specification.md` / `docs/database.md` / `docs/testing.md` — セットアップ・仕様・DB 設計・テスト設計（日本語）
