# 経理システム

![FutureTech Logo](/public/futuretech_logo.svg)

未来技術推進協会のための経理システム。案件の作成から経理申請・確認までの流れをウェブアプリで効率化する（`@future-tech-association.org` 以外のドメインはログイン不可）。

https://accounting.future-tech-association.org

## 主な機能

- **案件**: 登録・編集・削除・コピー、親子関係（関連案件）、経理申請、申請後の更新
- **取引先（売上）/ コスト**: 案件ごとに登録。請求日・振込期限・支払先・源泉徴収などを管理
- **経理処理**: 全案件一覧、取引先の確認・コストの支払い完了チェック、完了処理、申請後に更新された案件のハイライト
- **通知**: Slack で案件担当者へ通知（通知すると案件は下書きに戻る）
- **チーム**: チームリーダーによるチーム案件・収支の確認
- **ユーザー管理**: 権限・Slack ID、選択肢マスタ（チーム・分類・品目）の編集

画面ごとの詳細な仕様は [docs/specification.md](./docs/specification.md) を参照。

## 案件の状態

下書き（編集可能）→ 経理申請中（経理担当者の確認待ち。申請後も編集可）→ 経理確認完了 → 完了

## 権限

- **一般ユーザー**: 自分の案件の作成・管理
- **チームリーダー**: 自チームの案件を閲覧
- **経理担当者**: 全案件の確認・編集
- **管理者**: 全機能（ユーザー管理含む）

## 開発者向け情報

Next.js / TypeScript / Tailwind CSS + Mantine UI（グラフは `@mantine/charts`）/ Supabase（DB・認証）。

- 開発環境構築: [docs/setup.md](./docs/setup.md)
- 本番リリース: [docs/release.md](./docs/release.md)（リリース PR 作成・タグ作成は GitHub Actions で半自動化）

### 環境変数

Supabase・Google 認証・Slack 通知に加え、事前収支申告の未申告リマインド（Vercel Cron）用に以下が必要。一覧・設定手順は [docs/setup.md](./docs/setup.md) を参照。

- `CRON_SECRET`: Vercel Cron からのリクエストを認証するシークレット
- `SUPABASE_SERVICE_ROLE_KEY`: RLS を完全にバイパスできるキー。本アプリでは cron ルートの読み取りにのみ使うが、キー自体の権限は絞られていないため厳重に管理すること

## お問い合わせ

info@future-tech-association.org
