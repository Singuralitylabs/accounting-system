# テスト設計書

## 目次

1. [概要](#1-概要)
2. [テスト方針](#2-テスト方針)
   - [2.1 テストピラミッドと優先度](#21-テストピラミッドと優先度)
   - [2.2 実行タイミング（PR / リリース前）](#22-実行タイミングpr--リリース前)
   - [2.3 テストデータ方針](#23-テストデータ方針)
   - [2.4 可観測性](#24-可観測性)
   - [2.5 ユニットテストの要否判断](#25-ユニットテストの要否判断)
   - [2.6 テスト容易化リファクタリング方針](#26-テスト容易化リファクタリング方針)
3. [テスト対象と観点](#3-テスト対象と観点)
   - [3.1 ビジネスロジックユニットテスト](#31-ビジネスロジックユニットテスト)
   - [3.2 セキュリティテスト](#32-セキュリティテスト)
   - [3.3 型安全性テスト](#33-型安全性テスト)
   - [3.4 ビルドテスト](#34-ビルドテスト)
   - [3.5 コード品質テスト](#35-コード品質テスト)
   - [3.6 E2Eテスト（未実装・リリース前のみ）](#36-e2eテスト未実装リリース前のみ)
4. [CI / ツール構成](#4-ci--ツール構成)
   - [4.1 導入フェーズとロードマップ](#41-導入フェーズとロードマップ)
   - [4.2 GitHub Actions ワークフロー計画](#42-github-actions-ワークフロー計画)
   - [4.3 テストフレームワークの選定（Vitest）](#43-テストフレームワークの選定vitest)
   - [4.4 導入時に必要な変更](#44-導入時に必要な変更)
   - [4.5 Supabase DB Types チェックの前提設定](#45-supabase-db-types-チェックの前提設定)
5. [テスト規約](#5-テスト規約)
   - [テストファイルの配置](#テストファイルの配置)
   - [ファイル名の命名](#ファイル名の命名)
   - [テストの検証対象](#テストの検証対象)
   - [テスト対象カタログ](#テスト対象カタログ)
   - [テスト着手前のリファクタリング前提タスク](#テスト着手前のリファクタリング前提タスク)

## 1. 概要

本ドキュメントは案件管理システム（matter-controller）のテスト方針、テスト対象と観点、CI/ツール構成を整理する。

**現状、本プロジェクトにはテストフレームワーク・テストコード・CI のいずれも導入されていない**（TypeScript 型チェック + ESLint + 手動確認のみ）。本書は「あるべきテスト体制」とそこへ到達するための**段階的導入計画**を定義するものであり、各節の内容は導入フェーズ（[4.1](#41-導入フェーズとロードマップ)）に沿って順次実現する。

- **前提環境**: Next.js 14.2.35（App Router）/ TypeScript 5.6.3（strict）/ Supabase / yarn
- **関連ドキュメント**: [setup.md](./setup.md) / [specification.md](./specification.md) / [database.md](./database.md)

## 2. テスト方針

### 2.1 テストピラミッドと優先度

```text
    E2E Tests (少数・当面は手動)
  Integration Tests (中程度・当面は対象外)
Unit Tests (多数・最優先で導入)
```

- **狙い**: 変更頻度が高く壊れやすい領域は Unit/静的検査で早期に検知し、E2E は本数を絞って「破綻していないこと」を確認する。
- **優先度の決め方**: 変更頻度・影響範囲・障害時コストの観点で、認可・ドメイン制限、案件ステータス遷移、金額集計（損益計算書を含む）、ビルド成立性を優先する。
- **本プロジェクト固有の前提**: services 層が存在せず、ビジネスロジックは `app/utils/` 配下（特に `app/utils/supabase/`）に集約されている。ユニットテストの対象はこの配下の**純粋ロジック**に絞り、Supabase クエリの薄いラッパーは対象外とする。UI コンポーネントも原則対象外だが、**Phase 5 の権限別統合コンポーネント**は variant ごとの主要素（出る / 出ない）を Testing Library で固定する。

### 2.2 実行タイミング（PR / リリース前）

PR では短時間で完了するチェックを必須とし、リリース前は範囲を絞った確認を追加する。

- **PR（原則）**: 変更内容に応じて CI が自動実行される（Phase 1 以降で整備。型チェック、Lint、ビルド、ユニットテスト、デバッグ出力検知、フォーマットチェック）。
- **リリース前（gitlab リモートへの本番反映前）**: 影響範囲が広い変更（例: 認可・middleware、案件ステータス遷移、損益計算書、主要画面の動線）に対して、主要フローの手動確認を追加する（[3.6](#36-e2eテスト未実装リリース前のみ) 参照）。

CI のワークフロー計画は [4.2](#42-github-actions-ワークフロー計画) に記載する。

### 2.3 テストデータ方針

- **原則**: Unit テストは固定のインメモリ・フィクスチャ（型は `app/lib/database.types.ts` 由来の型に揃える）で独立性を確保し、Supabase・Slack 等の外部依存は直接叩かない。
- **統合確認が必要な場合**: ローカル Supabase（初回の `supabase start` または `supabase db reset` で `supabase/migrations/` が適用される）を前提に、対象を最小限に絞って再現性を担保する。当面は自動テストの範囲に含めない。
- **RLS の検証**: ユニットテストでは検証困難なため、RLS ポリシー自体は `supabase/migrations/` のレビューと手動確認でカバーする（[3.2](#32-セキュリティテスト) 参照）。

### 2.4 可観測性

- **失敗時の調査容易性**: テストが失敗した際に原因を素早く特定できるよう、確認観点ごとにチェックを分離し、テスト名やジョブ名から目的が読み取れる命名にする。
- **ログの扱い**: 開発時のデバッグ出力（`console.log` / `console.info` / `debugger`）がコードに残った場合は CI で検知してエラーにする。一方、障害調査に必要なログ（`console.error` 等）は意図的に残す。
  - 本書作成時点（2026年6月）で、ソースコード中の `console.log` / `console.info` / `debugger` は **0 件**であり、`console.*` の残存（約 90 件 / 28 ファイル）はすべてエラーログ用途の `console.error`（および少数の `console.warn`）である。したがってデバッグ出力検知 CI は**事前クリーンアップなしで導入可能**であり、「ゼロ件の維持」を目的として早期に有効化する。

### 2.5 ユニットテストの要否判断

機能の追加・修正時にユニットテストを書くかどうかは、以下の基準で判断する。この基準は新規コード・既存コードを問わず適用し、テスト済みのコードを修正した場合は対応するテストも合わせて更新する。

#### テストを書くべきもの

| 対象                                                | 理由                                                                                                      | 本プロジェクトでの例                                                                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 認可・ドメイン制限ロジック                          | 壊れるとセキュリティ事故につながる。手動確認では全パターンの網羅が困難                                    | `hasClassAccess` / `visibleNavItems`（`app/utils/permissions.ts`）、`isAllowedEmailDomain`（`app/utils/constants.ts`）、`middleware.ts` のルート判定 |
| 状態遷移・分岐・計算を含むビジネスロジック          | 案件ライフサイクル（下書き→経理申請中→経理確認完了→完了）と金額集計はシステムの中核。回帰時の影響が大きい | `editMatterInfo.ts` のステータス遷移判定・バリデーション・金額集計、`profitLossLogic.ts` の支払サイクル判定・月次集計                                |
| 日付・タイムゾーン変換                              | JST/UTC の月ズレは静かに壊れ、発見が遅れる                                                                | `toMonthString`（`app/utils/formatter.ts`）、`bulkUpsertCostInfo` 等の日付フォーマット処理                                                           |
| 外部API連携のメッセージ組み立て・エラーハンドリング | 障害時の挙動はテストなしでは確認できない                                                                  | Slack 通知（`app/utils/slack/sendMessageToSlack.ts`、`app/actions/slack/`）                                                                          |

上記に該当しないもの（Supabase クエリの薄い CRUD ラッパー、UI の見た目、`page.tsx` のデータ受け渡し、定数・型定義、`deleteMatter` のような単純削除処理など）は、RLS ポリシー・型チェック・Lint・ビルド・レビューでカバーできるためユニットテストは原則不要とする。判断に迷う場合は、ロジックの複雑さや障害時の影響度を基準にチームで相談する。

### 2.6 テスト容易化リファクタリング方針

本プロジェクトでは、テスト価値の高いロジックの一部が以下の形でテスト困難な構造になっている。

1. **ブラウザ API との密結合**: `editMatterInfo.ts` 等で `window.confirm` / `alert` がステータス遷移判定の内部に残っている（必須チェックと請求日/振込期限の検証は `matterValidation.ts` へ抽出済み。`confirm` / `alert` のコンポーネント側移動は Phase 6）。
2. ~~**純粋関数が module-private**: `middleware.ts` の `matchesRoute` は export されておらず直接 import してテストできない。~~ → **完了**（`app/utils/routeGuard.ts`）。損益計算書の集計は `app/utils/profitLossLogic.ts`。
3. **Supabase クライアント生成との密結合**: `bulkUpsertCostInfo` / `bulkUpsertBusinessInfo` の日付フォーマット・操作分岐ロジックが DB 呼び出しと同一関数内にある。

これらに対する方針は以下のとおり。

- **第一推奨: 純粋関数の分離**。判定・計算・整形ロジックを副作用（DB 呼び出し・ダイアログ・通知）から切り出し、`"use server"` の付かないファイル（例: `app/utils/` 直下）へ抽出して export する。UI 確認ダイアログは呼び出し側（コンポーネント/フック）の責務とする。
- **暫定手段: グローバルモック**。リファクタリング前にテストを先行させたい場合に限り、jsdom 環境 + `vi.stubGlobal`（`confirm` / `alert`）等で代替する。恒久策としては採用しない。
- リファクタリングは**テスト追加とは別 PR** とし、挙動変更がないことをレビューで担保する。対象一覧は [テスト着手前のリファクタリング前提タスク](#テスト着手前のリファクタリング前提タスク) に集約する。

## 3. テスト対象と観点

### 3.1 ビジネスロジックユニットテスト

ビジネスロジックの正しさを、外部I/O（Supabase / Slack / ブラウザ API）から切り離して確認する。

- **観点**
  - 案件ステータス遷移の判定（新規申請 / 申請後更新（差し戻し検知 `has_updates`）/ 完了 / 差し戻し）
  - 入力バリデーション（必須項目、請求日と振込期限の日付順序チェック）
  - 金額集計（`total_amount` / `total_cost` / `unchecked_cost_count`。`isRemoved` 行の除外、`isNew` フラグの扱い）
  - 損益計算書の集計（支払サイクル（月払い/四半期/年払い）の計上月判定、分類別粗利・費目別管理費・経常利益の算出、ロール別の集計範囲、チーム未指定（全体共通）費用の扱い）
  - `isNew` / `isRemoved` フラグによる INSERT / UPDATE / DELETE の振り分け
  - 日付フォーマット（JST での月ズレが起きないこと）
- **対象の詳細**: [テスト対象カタログ](#テスト対象カタログ) を参照。
- **実行タイミング**: [2.2 実行タイミング](#22-実行タイミングpr--リリース前) に従う。

### 3.2 セキュリティテスト

認証・認可・ドメイン制限の制御が、意図した振る舞いを満たすことを確認する。

本プロジェクトのセキュリティテストは、**単体で確認できる部分はユニット**、**実際の認証フロー・RLS に関わる部分は手動**に分類する。

| 観点           | CI（自動）                                                                                                                               | 手動                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 認証制御       | ―                                                                                                                                        | 未ログインユーザーの `/login` リダイレクト                                                                      |
| 認可制御       | `hasClassAccess` / `visibleNavItems` / ルートマッチングの判定ロジック（`ROUTE_PERMISSIONS` のロール別許可/拒否）                         | middleware 経由の実アクセス制御（`/team` / `/accounting` / `/profit-loss` / `/recurring-costs` / `/dashboard`） |
| ドメイン制限   | `isAllowedEmailDomain`（完全一致のみ許可、`evil-future-tech-association.org` のような部分一致の拒否、null/空文字/大文字小文字/前後空白） | Google OAuth コールバックでの実挙動                                                                             |
| データアクセス | ―（ユニットでは検証困難）                                                                                                                | RLS によるデータ分離（チームリーダーの自チーム案件閲覧など）                                                    |

- **実行タイミング**: [2.2 実行タイミング](#22-実行タイミングpr--リリース前) に従う。

### 3.3 型安全性テスト

TypeScript と型生成の運用によって、型の破綻を早期に検知する。

- **観点**
  - **コンポーネント/ロジック型**: `tsc --noEmit` による型チェック（※ `typecheck` スクリプトの追加が必要。[4.4](#44-導入時に必要な変更) 参照）と ESLint により型不整合を検知する
  - **データベース型**: スキーマ変更時に `yarn db:types-local` を実行し `app/lib/database.types.ts` を更新する運用（CLAUDE.md / setup.md 記載）を、CI での型再生成 + 差分チェックで機械的に担保する
- **実行タイミング**: [2.2 実行タイミング](#22-実行タイミングpr--リリース前) に従う。

### 3.4 ビルドテスト

本番相当のビルドが成立することを確認する。

- **観点**
  - `next build` が完走する
  - 依存関係のインストールが lockfile（`yarn.lock`）どおりに成功する
- **実行タイミング**: [2.2 実行タイミング](#22-実行タイミングpr--リリース前) に従う。

### 3.5 コード品質テスト

デバッグ用出力の混入とコード整形の崩れを早期に検知する。

- **観点**
  - **静的解析**: ESLint（`yarn lint`、導入済み）
  - **デバッグ出力**: `console.log` / `console.info` / `debugger` の混入を検知して失敗させる（`console.error` / `console.warn` はエラーログとして許容する）
  - **コード整形**: Prettier 未適用のフォーマット崩れを検知して失敗させる（※ `.prettierrc` は設定済みだが `format` / `format:check` スクリプトの追加が必要。[4.4](#44-導入時に必要な変更) 参照）
- **実行タイミング**: [2.2 実行タイミング](#22-実行タイミングpr--リリース前) に従う。

### 3.6 E2Eテスト（未実装・リリース前のみ）

実ユーザー視点の主要ジャーニーを、少数のケースで確認する（全網羅はしない）。

- **実施条件**: リリース前（gitlab リモートへの本番反映前）、または影響範囲が大きい変更（認可、案件ステータス遷移、損益計算書、主要画面の動線）
- **実施方法**: 単一ブラウザで、主要フローを1〜2本確認する（当面は手動）
- **対象フロー例**
  - ログイン → 案件作成（下書き）→ 経理申請 → 経理確認完了 → 完了
  - 経理申請後の編集 → 経理画面での差し戻しハイライト表示 → Slack 通知 → 差し戻し
  - teamleader / accounting / admin / public 各ロールでの保護ページアクセス → 適切なリダイレクト
  - 損益計算書の月次・年間表示（ロールによる表示範囲の違い）
- **実行タイミング**: リリース前のみ。

## 4. CI / ツール構成

### 4.1 導入フェーズとロードマップ

テスト体制はゼロからの導入となるため、以下の 3 フェーズで段階的に整備する。

| フェーズ                  | 内容                                                                                                                                                                                                                                          | 成果物                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Phase 1: 基盤導入**     | Vitest 導入、`typecheck` / `format` 系スクリプト追加、GitHub Actions の基本ワークフロー（typecheck / lint / build / unit test / console 検知 / format-check）整備。**即テスト可能な純粋関数**（認可・ドメイン制限・フォーマッタ）のテスト作成 | `vitest.config.ts`、`tests/` 配下の初期テスト、`.github/workflows/*.yml` |
| **Phase 2: コアロジック** | テスト容易化リファクタリング（[2.6](#26-テスト容易化リファクタリング方針)）を実施した上で、案件ステータス遷移・金額集計・損益計算書・ルート判定のテスト作成。db-types 整合性チェックの CI 追加                                                | リファクタリング PR + 対応テスト                                         |
| **Phase 3: 拡充**         | bulkUpsert 系の日付フォーマット・操作分岐、Slack 通知のテスト作成。E2E（自動化）の要否検討                                                                                                                                                    | 残対象のテスト、E2E 方針の見直し                                         |

### 4.2 GitHub Actions ワークフロー計画

CI/CD の実行基盤には GitHub Actions を利用する（origin = GitHub。gitlab リモートは本番反映用であり、CI は GitHub 側に集約する）。

| Workflow（予定）               | 目的                         | 主な実行内容                                          | 導入フェーズ | 前提                                                   |
| ------------------------------ | ---------------------------- | ----------------------------------------------------- | ------------ | ------------------------------------------------------ |
| TypeScript Type Check          | 型安全性と静的品質の早期検出 | `tsc --noEmit` + ESLint                               | Phase 1      | `typecheck` スクリプト追加                             |
| Build Test                     | 本番相当のビルド成立性を検証 | 依存関係インストール + `next build`                   | Phase 1      | ―                                                      |
| Unit Tests                     | ユニットテスト実行           | Vitest                                                | Phase 1      | Vitest 導入                                            |
| Check console.log and debugger | デバッグ用出力の混入を防止   | `console.log` / `console.info` / `debugger` 検査      | Phase 1      | 現状 0 件のため即導入可                                |
| Format Check                   | コード整形の統一性を担保     | `prettier --check`                                    | Phase 1      | `format:check` スクリプト追加                          |
| Supabase DB Types Consistency  | DB 型定義の整合性監視        | 型生成 + `app/lib/database.types.ts` との差分チェック | Phase 2      | [4.5](#45-supabase-db-types-チェックの前提設定) の設定 |

- トリガーはいずれも `pull_request` / `push`（対象パスで絞り込み）+ `workflow_dispatch` を基本とする。
- ジョブは観点ごとに分離し、失敗時にどの観点が壊れたか一目で分かるようにする（[2.4 可観測性](#24-可観測性)）。

### 4.3 テストフレームワークの選定（Vitest）

ユニットテストのフレームワークには **Vitest** を採用する。

- **選定理由**
  - TypeScript / ESM / パスエイリアス（`@/*`）の解決が軽量な設定で済み、トランスフォーマ（`ts-jest` / `babel-jest`）の追加設定が不要
  - テスト実行が高速で、watch モードの開発体験が良い
  - テストファイル単位で jsdom / node 環境を切り替えられ、ブラウザ API 混入ロジックの暫定テスト（[2.6](#26-テスト容易化リファクタリング方針)）に対応しやすい
- **留意点**: 関連プロジェクト（singularity-lab-portal）は Jest を採用しており、フレームワークが分かれる。テスト規約（配置・命名・検証スタイル。[第5章](#5-テスト規約)）は両プロジェクトで揃えることでノウハウの共有を維持する。API 差分（`jest.fn()` ↔ `vi.fn()` 等）は限定的。

### 4.4 導入時に必要な変更

テスト基盤の導入時に、以下の追加が必要となる（本書の時点では未実施）。

- **devDependencies**: `vitest`、`prettier`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`、`@testing-library/dom`、`@vitejs/plugin-react`（コンポーネントテスト用。セットアップは `tests/setup.ts`）
- **package.json scripts**:

  | スクリプト     | 内容                 |
  | -------------- | -------------------- |
  | `test`         | `vitest run`         |
  | `test:watch`   | `vitest`             |
  | `typecheck`    | `tsc --noEmit`       |
  | `format`       | `prettier --write .` |
  | `format:check` | `prettier --check .` |

- **設定ファイル**: `vitest.config.ts`（パスエイリアス `@/*` の解決、デフォルト環境 `node`、JSX 用に `@vitejs/plugin-react`。コンポーネントテストは `// @vitest-environment jsdom`）
- **デバッグ出力検査**: `console.log` / `console.info` / `debugger` を検知するスクリプトまたは ESLint ルール（`no-console`（`allow: ["error", "warn"]`）+ `no-debugger`）。既存の `.eslintrc.json` への追加で実現できる場合は専用スクリプトを作らない。

### 4.5 Supabase DB Types チェックの前提設定

DB Types 整合性チェックのワークフローを実行するために、GitHub Actions 側で以下の設定が必要。

- **Secret**: `SUPABASE_ACCESS_TOKEN`（Supabase CLI で利用する Personal Access Token）
- **Variable**: `SUPABASE_PROJECT_ID`（対象 Supabase プロジェクトの Project ID。`.env.local` / `yarn db:types` の `PROJECT_ID` に相当する。Variable 名は関連プロジェクトの CI と揃えているため、ワークフロー内で既存スクリプトを利用する場合は `PROJECT_ID` 環境変数へマッピングして渡す）
- もしくは、CI 上でローカル Supabase（`supabase start`）+ `yarn db:types-local` を用いて `supabase/migrations/` から型を再生成し、コミット済みの `app/lib/database.types.ts` との差分を検知する方式でもよい（リモート接続不要。導入時にいずれかを選定する）。

## 5. テスト規約

### テストファイルの配置

- 原則としてテストコードは `tests/` 配下に配置する。
- ディレクトリ構成は、対象コード（`app/` 配下）の構造に寄せて配置する。
  - 例: `app/utils/permissions.ts` → `tests/utils/permissions.test.ts`
  - 例: `app/utils/supabase/editMatterInfo.ts` → `tests/utils/supabase/editMatterInfo.test.ts`
  - 例: `app/components/CostBlock.tsx` → `tests/components/CostBlock.test.tsx`

### ファイル名の命名

- Vitest は `*.test.ts` / `*.spec.ts` をテストとして実行できるが、本プロジェクトでは純粋関数は `*.test.ts`、JSX を含むコンポーネントテストは `*.test.tsx` に統一する（`*.spec.ts` は使わない）。
- テストファイル名は「対象 + 期待する振る舞い」が想像できる名前にする。
- コンポーネントテストはファイル先頭に `// @vitest-environment jsdom` を付ける。デフォルト環境は `node` のままにする。
- 描画は `tests/testUtils/renderWithMantine.tsx`（`MantineProvider` + `DatesLocaleProvider`）経由で行う。

### テストの検証対象

- **検証する**: 関数の入力に対する出力（返り値）、副作用の結果（状態変化）、エラー時の振る舞い
- **検証しない**: 内部実装の呼び出し手順（クエリメソッドをどの引数で呼んだか等）
- モックは外部依存を切り離すために使用するが、モック呼び出し引数の逐次検証は原則行わない
- 返り値を持たない関数は、副作用の結果（更新値・更新対象）が正しいことを検証する

### テスト対象カタログ

テスト未実装の現状を踏まえ、「実装済みテスト一覧」の代わりに優先度・前提条件付きの対象カタログを定義する。テストを実装したら本表のステータスを更新していく。

| #   | 対象                                                                                           | ファイル                                                                                           | 主なテスト観点                                                                                                                                                                                                                    | 価値     | 前提                                                                                                                    | フェーズ |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | ドメイン制限 `isAllowedEmailDomain`                                                            | `app/utils/constants.ts`                                                                           | 完全一致のみ許可 / 部分一致ドメインの拒否 / null・空文字・`@`なし / 大文字小文字・前後空白                                                                                                                                        | 高       | なし（純粋関数・export 済）                                                                                             | 1        |
| 2   | 認可判定 `hasClassAccess` / `visibleNavItems`                                                  | `app/utils/permissions.ts`                                                                         | `ROUTE_PERMISSIONS` のロール別許可/拒否 / null・undefined・未知ロール / ナビ項目のロール別フィルタ                                                                                                                                | 高       | なし（純粋関数・export 済）                                                                                             | 1        |
| 3   | 日付・金額フォーマッタ                                                                         | `app/utils/formatter.ts`                                                                           | `toMonthString` の月境界（ローカル時刻基準で UTC ズレがないこと）/ `formatCurrency` の null / `formatMonthLabel` 等                                                                                                               | 中       | なし（純粋関数・export 済）                                                                                             | 1        |
| 4   | 案件の金額集計 ✅実装済（`tests/utils/matterCalc.test.ts`）                                    | `app/utils/matterCalc.ts`                                                                          | `isRemoved` 行の集計除外 / `total_amount` / `total_cost` / `unchecked_cost_count`（`is_completed` と `isNew` の扱い）/ 作成時の falsy 金額スキップ                                                                                | 非常に高 | 済（`addMatterInfo` / `editMatterInfo` から抽出）                                                                       | 1〜2     |
| 5   | ステータス遷移 + バリデーション `editMatterInfo`                                               | `app/utils/supabase/editMatterInfo.ts` / `app/utils/matterValidation.ts`                           | `isNewApplication`（下書き→申請）/ `isPostSubmissionUpdate`（申請後更新で `has_updates`）/ 必須項目 / 請求日 > 振込期限の検出                                                                                                     | 非常に高 | バリデーションは抽出済（`tests/utils/matterValidation.test.ts`）。遷移判定と `confirm` のコンポーネント側移動は Phase 6 | 2        |
| 6   | 損益計算書の計上月判定・月次集計 ✅実装済（`tests/utils/profitLossLogic.test.ts`）             | `app/utils/profitLossLogic.ts`                                                                     | `monthDiff` / `isRecurringCostChargedInMonth`（月払い・四半期・年払いの計上月、年度跨ぎ、`end_month` null）/ `buildMonthlyReport`（分類別粗利、費目別管理費、経常利益と刷新前の営業損益の一致、ロール別集計、全体共通費用の分離） | 非常に高 | 済（`app/utils/profitLossLogic.ts` へ抽出 + export 済）                                                                 | 2        |
| 7   | ルート判定 `matchesRoute` + `classifyPath` ✅実装済（`tests/utils/routeGuard.test.ts`）        | `app/utils/routeGuard.ts`                                                                          | 完全一致・配下パス（`/team/sub`）の一致 / 前方一致の誤検知（`/teamX`）がないこと / public_skip・auth_only・restricted の分類 / `isTransientAuthError` の 5xx                                                                      | 高       | 済（`middleware.ts` から抽出）                                                                                          | 2        |
| 8   | 一括完了のステータス遷移チェック                                                               | `app/utils/supabase/checkMatterInfoList.ts`                                                        | 下書き（`is_fixed=false`）の完了スキップ / `unchecked_cost_count > 0` の確認分岐                                                                                                                                                  | 中       | `confirm` 分離リファクタ                                                                                                | 2        |
| 9   | bulkUpsert の操作分岐・日付フォーマット                                                        | `app/utils/supabase/costs.ts` / `businesses.ts`（`bulkUpsertCostInfo` / `bulkUpsertBusinessInfo`） | `isNew` / `isRemoved` の組による INSERT / UPDATE / DELETE 振り分け / `toISOString` 由来の JST 月ズレ回帰                                                                                                                          | 高       | 分岐・フォーマット部の純粋関数抽出（`"use server"` + Supabase 密結合のため）                                            | 2〜3     |
| 10  | Slack 通知のメッセージ組み立て                                                                 | `app/utils/slack/sendMessageToSlack.ts`、`app/actions/slack/`                                      | `slackId` 有無によるメンション切替 / metadata の null-safe 処理 / 送信失敗時のエラーハンドリング                                                                                                                                  | 中       | `fetch` / `notifications.show` の分離またはモック                                                                       | 3        |
| 11  | 権限別統合コンポーネント `CostBlock` ✅実装済（`tests/components/CostBlock.test.tsx`）         | `app/components/CostBlock.tsx`                                                                     | `variant="user"` で入力・削除が出て支払い完了が出ない / `variant="accounting"` で支払い完了と閲覧表示が出て入力・削除が出ない / `isFixed`・`isCompleted` による無効化                                                             | 高       | Testing Library + jsdom（Phase 5-a で導入）                                                                             | 5        |
| 12  | 権限別統合コンポーネント `BusinessBlock` ✅実装済（`tests/components/BusinessBlock.test.tsx`） | `app/components/BusinessBlock.tsx`                                                                 | `variant="user"` で入力・削除が出て確認完了が出ない / `variant="accounting"` で確認完了と閲覧表示が出て入力・削除が出ない / `isFixed`・`isCompleted` による無効化                                                                 | 高       | Testing Library + jsdom（Phase 5-a）                                                                                    | 5        |
| 13  | 権限別統合コンポーネント `MatterCard` ✅実装済（`tests/components/MatterCard.test.tsx`）       | `app/components/MatterCard.tsx`                                                                    | `variant="user"` で「開く」「経理申請中/下書き」が出て担当者・更新ありが出ない / `variant="accounting"` で「詳細」「経理確認待ち/申請者編集中」・担当者・未チェックコスト数が出る                                                 | 高       | Testing Library + jsdom（Phase 5-a）                                                                                    | 5        |
| ―   | 薄い CRUD ラッパー（`getAllMatterInfoList` 等）/ `deleteMatter` / その他 UI                    | 各所                                                                                               | ―                                                                                                                                                                                                                                 | 低       | テスト不要（[2.5](#25-ユニットテストの要否判断) の基準）。Phase 5 統合コンポーネントは例外                              | ―        |

### テスト着手前のリファクタリング前提タスク

上表の「前提」列のうちリファクタリングを要するものを集約する。いずれも**挙動を変えない構造変更**であり、テスト追加とは別 PR で実施する。

1. ~~**損益計算書の純粋ヘルパー抽出**（#6 の前提）: `monthDiff` / `isRecurringCostChargedInMonth` / `buildMonthlyReport` 等を `"use server"` の付かないファイルへ移動して export する。~~ → **完了**（`app/utils/profitLossLogic.ts`）
2. ~~**`matchesRoute` の共有化**（#7 の前提）: `middleware.ts` 内のプライベート関数を export するか、`app/utils/permissions.ts` へ移動する。~~ → **完了**（`app/utils/routeGuard.ts`）
3. **案件編集ロジックの UI 副作用分離**（#5, #8 の前提）: バリデーションは `matterValidation.ts` へ抽出済。`editMatterInfo` / `checkMatterInfoList` の遷移判定と `confirm` / `alert` を呼び出し側（コンポーネント）へ移す作業は Phase 6。
4. **bulkUpsert の分岐・日付整形の抽出**（#9 の前提）: `isNew` / `isRemoved` による振り分けと日付フォーマットを純粋関数として切り出す（あわせて JST 月ズレの有無を確認し、必要なら `toMonthString` と同様のローカル時刻基準へ修正する）。
