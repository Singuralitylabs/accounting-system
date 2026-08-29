# リリース／カットオーバー手順書

本番反映の手順書。対象は次の 2 つの作業であり、**両者は独立して実施できない**（理由は 1.2）。

| 作業           | 内容                                                                 | 追跡                                                                  |
| -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| リリース       | `main` の実装を `release` ブランチへ反映し本番デプロイする           | 本書                                                                  |
| カットオーバー | 本番を旧 `matter-controller` から新 `accounting-system` へ一本化する | [#68](https://github.com/Singuralitylabs/accounting-system/issues/68) |

## 1. 前提と作業順序

### 1.1 現状

|                | 旧（現行本番）                          | 新（切替先）                                                           |
| -------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Vercel         | `https://matter-controller.vercel.app/` | `https://accounting-system.vercel.app/`                                |
| 接続リポジトリ | **GitLab** リポジトリの `release`       | **本 GitHub** リポジトリの `release`                                   |
| Supabase       | 旧プロジェクト                          | 新プロジェクト                                                         |
| スキーマ       | マイグレーション導入前の手適用スキーマ  | `supabase/migrations/` 17 本を適用済み（選択肢マスタのシードまで完了） |
| 業務データ     | **本番データあり**                      | **案件・ユーザーデータは空**                                           |
| 利用者         | **こちらを使用中**                      | 未誘導                                                                 |

`release` ブランチに未反映の `main` コミットは **53 件 / 226 ファイル**（+17,142 / −5,030）。

旧 Vercel は GitLab リポジトリを見ているため、**本リポジトリの `release` へマージしても旧本番には影響しない**。新 Vercel の Production Branch が `release` なので、マージがそのまま新環境の本番デプロイになる。

### 1.2 なぜリリースとカットオーバーを分離できないか

- `main` には DB マイグレーション 17 本が含まれ、うち **10〜17 は `release` 時点のスキーマに存在しない**変更（新テーブル 2 つ、`profiles` の RLS 厳格化、認証フック、GRANT 復元）。
- 新 Supabase は既に `main` 相当のスキーマ。ここに**旧コード**を載せると `getAllUserInfo()`（`profiles` 全件 SELECT）などが RLS 厳格化に阻まれて壊れる。
- 逆に旧 Supabase に**新コード**を載せると、`recurring_costs` / `extra_entries` が存在せず `/recurring-costs` `/extra-entries` `/profit-loss` が動かない。
- したがって整合する組み合わせは「**新環境 × 新コード**」のみ。リリースとカットオーバーは一連の作業として実施する。

### 1.3 作業順序

```
Phase A 事前準備（無停止・数日前でも可）
   ↓
Phase B 新環境へリリース（利用者はまだ旧を使用。新環境で本番検証）
   ↓
Phase C メンテナンス（旧の書き込み停止 → データ移行 → 突合）
   ↓
Phase D 切替（利用者を新 URL へ誘導、旧を読み取り専用化）
   ↓
Phase E 切替直後の確認
   ↓
Phase F 監視 → 旧環境廃止 → リポジトリ後片付け
```

Phase A・B は利用者影響なしで先行実施できる。当日のメンテナンス時間に入れるのは Phase C 以降のみ。

## 2. 着手前に確定させる事項

| #   | 確認事項                                                                 | 確認場所                                                   | 未確認のまま進めた場合                                                 |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | 新 URL で汎用 Sign in 画面が出る原因（#68 の WARNING）                   | Vercel（新プロジェクト）→ Settings → Deployment Protection | 切替後に**全利用者がログインできない**                                 |
| 2   | 旧 Supabase の `auth.users` / `auth.identities` を新へコピーできるか     | 旧プロジェクトの接続情報・権限                             | 移行した案件が利用者本人と紐づかない（3.4 の二重プロフィール問題）     |
| 3   | 旧本番の書き込みを止める手段                                             | 旧 Vercel（GitLab 接続）の設定                             | メンテナンス中に旧へ書き込まれ、移行データが古くなる                   |
| 4   | 新 Supabase の Authentication → Hooks で Custom Access Token Hook の状態 | 新 Supabase ダッシュボード                                 | 3.3 を参照（未設定でも動作するが、順序を誤ると全ユーザーログイン不能） |

旧本番のメンテナンス表示はコード変更を伴うため GitLab リポジトリ側の作業になる。簡便策として、Vercel（旧プロジェクト）の Deployment Protection（Password Protection）を有効にする、または該当デプロイを停止する方法がある。**どちらを採るか事前に決めておく。**

## 3. リリース内容と利用者への影響

### 3.1 主要な変更

| 変更                                                          | PR        | 利用者影響                                                        |
| ------------------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| `@supabase/auth-helpers-nextjs` → `@supabase/ssr` 全面移行    | #48       | **Cookie 形式が変わるため全ユーザー再ログインになる可能性が高い** |
| トップページのロール別ハブ化・案件一覧を `/matters` へ移設    | #34       | **ブックマーク / Slack 内リンクの URL 変更**                      |
| 定期費用マスタ（`recurring_costs`）                           | #10 / #11 | 新機能                                                            |
| 経理追加収支（`extra_entries`）                               | #14       | 新機能                                                            |
| 損益計算書をスプレッドシート運用の構造に変更                  | #32       | 表示構造の変更                                                    |
| `profiles` の RLS 厳格化・UPDATE の WITH CHECK 追加           | #12 / #13 | 一般ユーザーから他人のプロフィールが見えなくなる                  |
| middleware のロール判定を JWT `user_class` クレーム化         | #24 / #26 | 認証フックの有効化が必要（3.3）                                   |
| `public` スキーマの GRANT 復元                                | #17       | 未適用だと**全クエリが 403**                                      |
| Next.js 14.2.15 → 14.2.35、日付ピッカーを `@mantine/dates` へ | #25 ほか  | セキュリティパッチ。日付 UI の見た目変更                          |

### 3.2 DB マイグレーション

新 Supabase では 17 本すべて適用済み（テーブル / RLS / トリガー / 選択肢マスタのシードまで完了）。Phase A では `supabase migration list` で全件 applied であることを**確認するだけ**でよい。

### 3.3 Custom Access Token Hook

`public.custom_access_token_hook` を Supabase ダッシュボード（Authentication → Hooks）で有効化する。

- 関数はマイグレーション 15 / 16 で作成済みのため、**新 Supabase では今すぐ有効化してよい**。関数が存在しない状態で有効化するとトークン発行自体が失敗し全ユーザーがログイン不能になるが、この条件は既に満たされている。
- 有効化を忘れた場合は `middleware.ts` が `profiles` への DB クエリにフォールバックするため動作はする（性能が戻るだけ）。詳細は `docs/database.md` 7 章。

### 3.4 最大のリスク: 二重プロフィールによる案件の紐づけ喪失

新 Supabase の `auth.users` は空である。一方、アプリは**ログインユーザーの `auth.users.id`（UUID）で `profiles` を引く**（`getCachedProfileInfo` → `getCachedProfileInfoById(user.id)`）。

旧の `profiles` をそのまま投入したうえで利用者が新環境で Google ログインすると、次が起きる。

1. 新 Supabase が**新しい UUID** を発行する（旧の UUID とは無関係）
2. その UUID の `profiles` 行が無いため、`app/auth/callback/route.ts` が `insertUserInfo()` で**新規プロフィール行を作る**（`class` は既定の `public`）
3. `profiles.email` に UNIQUE 制約は無いため、二重行はエラーにならず素通りする
4. 結果、利用者は「権限 `public` で案件を 1 件も持たないユーザー」として振る舞う。移行した案件は旧プロフィール行（`matters.user_id` が参照）に紐づいたまま**誰からも見えなくなる**

対策は次のいずれか。**方式 A を推奨する。**

- **方式 A（推奨）**: 旧 Supabase の `auth.users` と `auth.identities` を新へコピーし、UUID を保持する。`auth.identities` を移さないと、同じ Google アカウントでのログインが新規ユーザー扱いになり同じ問題が起きる。
- **方式 B**: 切替前に全利用者へ新環境で 1 回ログインしてもらい新 UUID を確定させ、`profiles` 投入時に **email をキーに `user_id` を張り替える**。ログイン時に自動作成された `profiles` 行が残るため、投入前に `profiles` を空にしてから流し込む。全員のログインが揃うまで切替できない点に注意。

いずれの方式でも、`matters.user_id` は `profiles.id`（bigint）を参照するため **`profiles.id` の値は旧のまま保持する**こと。

## 4. Phase A — 事前準備（無停止）

- [ ] 2 章の 4 項目を確認・決定する
- [ ] `main` 最新（`a72abee`）で CI 4 本（typecheck+lint / test / build / format-check）が green
- [ ] 新 Vercel の Environment Variables（Production スコープ）が**新** Supabase を指している
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SLACK_WEBHOOK_URL`
- [ ] 新 Vercel の Deployment Protection を Production で無効化（#68 の WARNING の解消）
- [ ] Google Cloud Console の OAuth クライアントに新ドメインのコールバック URL を登録
- [ ] 新 Supabase の Authentication → URL Configuration の Site URL / Redirect URLs が新ドメイン
- [ ] 新 Supabase のマイグレーションが全件 applied であることを `supabase migration list` で確認
- [ ] Custom Access Token Hook を有効化（3.3）
- [ ] 新環境でテストアカウントが協会ドメインの Google 認証でログインできる
- [ ] 3.4 の方式 A / B を決め、方式 A なら `auth.users` / `auth.identities` のコピー手順を旧環境で試しておく
- [ ] 旧 Supabase のバックアップを取得（Database → Backups もしくは `supabase db dump`）
- [ ] 利用者へ切替日時・新 URL・**再ログインが必要な旨**・案件一覧 URL の変更を事前周知

## 5. Phase B — 新環境へのリリース

### 5.1 main → release のマージ

旧 Vercel は GitLab リポジトリを見ているため、本リポジトリの `release` へのマージが旧本番に影響することはない。新 Vercel（Production Branch = `release`）のみがデプロイされる。

過去のリリースと同じくマージコミットで取り込む（PR 経由を推奨。CI とレビュー履歴が残る）。

```bash
git fetch origin
git switch -c release origin/release
git merge --no-ff origin/main -m "Merge branch 'main' into 'release'"
git push -u origin release
```

PR 経由の場合は base `release` / head `main` で作成し、CI green を確認したうえで**マージはユーザーが実施**する（`CLAUDE.md` の作業ルールによりエージェントはマージ不可）。

### 5.2 デプロイ確認

- [ ] 新 Vercel の Production デプロイが成功（Build Logs に `✅ - Build can proceed`）
- [ ] 新 URL がアプリのログイン画面を表示する（汎用 Sign in 画面でない）

### 5.3 新環境での本番検証（利用者は旧のまま）

`docs/testing.md` 3.7「手動確認（RLS・権限クラス別）」に沿って、`public` / `teamleader` / `accounting` / `admin` の 4 クラスで確認する。ロールは新 Supabase の `profiles.class` を直接更新して用意する。

- [ ] ログイン（協会ドメイン限定、ドメイン外は拒否）
- [ ] 案件の一覧・作成・編集・コピー・削除、経理申請、経理確認完了、差し戻し検知
- [ ] `/accounting` `/team` `/profit-loss` `/recurring-costs` `/extra-entries` `/dashboard` の可否がロール通り
- [ ] Slack 通知（**本番チャンネルに飛ぶ**ため、テストである旨を添えるか事前に周知する）

> ここで作成したテストデータ（`auth.users` / `profiles` / 案件）は、Phase C の移行前に**必ず削除する**。残すと旧データと混在し、方式 A では UUID 衝突の原因にもなる。

## 6. Phase C — メンテナンス（書き込み停止とデータ移行）

ここからが停止時間。新側は空なので差分マージではなく**旧データの一括移行**になる。所要は概ね 30〜60 分。

### 6.1 旧環境の書き込み停止

- [ ] メンテナンス開始を周知
- [ ] 2 章 #3 で決めた方法で旧アプリの書き込みを止める

### 6.2 新環境の検証データ削除

- [ ] Phase B で作成した `profiles` / `matters` / `costs` / `business` の行を削除
- [ ] Phase B でログインしたテストアカウントの `auth.users` / `auth.identities` の行を削除（方式 A の UUID 衝突回避）
- [ ] 選択肢マスタ（`select_option_types` / `select_options`）はマイグレーションのシードなので**残す**

### 6.3 旧 Supabase からダンプ

接続文字列は各プロジェクトの Settings → Database から取得する。

```
OLD_DB_URL = postgresql://postgres:<pass>@db.<旧ref>.supabase.co:5432/postgres
NEW_DB_URL = postgresql://postgres:<pass>@db.<新ref>.supabase.co:5432/postgres
```

1. **列構成の差分を先に確認する。** 新旧で `\d public.matters` などを比較する。旧にしか無い列があると投入が失敗する（新にしか無い列は既定値で埋まるため問題ない）。
2. **認証情報をダンプする**（方式 A の場合）。

```bash
pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
  -t auth.users -t auth.identities > old_auth.sql
```

3. **業務データをダンプする。**

```bash
pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
  -t public.profiles -t public.matters -t public.costs -t public.business \
  > old_data.sql
```

`--column-inserts` は使わない。`costs` / `business` は `GENERATED ALWAYS AS IDENTITY` のため、INSERT 形式では `OVERRIDING SYSTEM VALUE` が必要になる。既定の COPY 形式でダンプする。

`select_option_types` / `select_options` は新側にシード済み。旧側で選択肢を追加している場合のみ、差分を `ON CONFLICT DO NOTHING` で流し込む（`matters.team` / `category` は text 列で外部キーではないため、id の一致は不要）。

### 6.4 新 Supabase へ投入

投入順は `auth.users` → `auth.identities` → `profiles` → `matters` → `costs` / `business`（外部キーの依存順）。

- 方式 A: `old_auth.sql` → `old_data.sql` の順に投入する。
- 方式 B: `old_data.sql` の投入前に `profiles.user_id` を email で新 UUID へ張り替える。

投入後、**採番シーケンスを必ず進める**（怠ると切替直後の新規登録が主キー重複で全滅する）。

```sql
SELECT setval(pg_get_serial_sequence('public.profiles','id'),       COALESCE((SELECT MAX(id) FROM public.profiles), 1));
SELECT setval(pg_get_serial_sequence('public.matters','id'),        COALESCE((SELECT MAX(id) FROM public.matters), 1));
SELECT setval(pg_get_serial_sequence('public.costs','id'),          COALESCE((SELECT MAX(id) FROM public.costs), 1));
SELECT setval(pg_get_serial_sequence('public.business','id'),       COALESCE((SELECT MAX(id) FROM public.business), 1));
SELECT setval(pg_get_serial_sequence('public.select_options','id'), COALESCE((SELECT MAX(id) FROM public.select_options), 1));
```

### 6.5 突合

新旧両方で実行し、件数と最終更新日時が一致することを確認する。

```sql
SELECT 'profiles' AS t, count(*), max(updated_at) FROM profiles
UNION ALL SELECT 'matters',  count(*), max(updated_at) FROM matters
UNION ALL SELECT 'costs',    count(*), max(updated_at) FROM costs
UNION ALL SELECT 'business', count(*), max(updated_at) FROM business;
```

- [ ] 4 テーブルの件数が一致
- [ ] `max(updated_at)` が一致
- [ ] `profiles` に **email の重複行が無い**（3.4 の二重プロフィールが起きていない）
- [ ] `profiles.class` の内訳（`admin` / `accounting` / `teamleader` / `public` の人数）が旧と一致
- [ ] 直近の案件を数件、画面で開いて金額・取引先・コストが一致
- [ ] 孤児レコードが無い（`matters.user_id` / `costs.matter_id` / `business.matter_id` が解決できる）

## 7. Phase D — 切替

- [ ] 利用者へ新 URL を案内（再ログインが必要な旨を再掲）
- [ ] 旧 URL に「新環境へ移動」バナーを出す、または読み取り専用にする
- [ ] 旧 Supabase を読み取り専用にする（誤入力の防止）

## 8. Phase E — 切替直後の確認

新 URL で実データに対して確認する。**最初のログインは移行した実アカウントで行い、既存の案件が自分のものとして見えることを確認する**（3.4 の検証）。

- [ ] Google ログイン（協会ドメイン）
- [ ] ログイン後、自分の案件が一覧に出る／権限が移行前と同じ
- [ ] 案件の一覧・作成・編集・経理申請
- [ ] 経理一覧・損益計算書などの権限付き画面
- [ ] Slack 通知
- [ ] 移行データが正しく見えている（担当者名、チーム、金額集計）

## 9. Phase F — 監視・廃止・後片付け

- [ ] 一定期間（最低 1〜2 週間）は旧 Vercel / 旧 Supabase を**残したまま**並行監視する
- [ ] リリースタグを付与する

```bash
git tag -a REL-TAG-3.0.0 -m "リリースノート（機能追加 / DB 変更 / 破壊的変更）" release
git push origin REL-TAG-3.0.0
```

> 破壊的変更（再ログイン必須、案件一覧 URL の変更、本番環境の移行）を含むため `3.0.0`。過去実績は `REL-TAG-1.0.0` / `1.1.0` / `2.0.0`。

- [ ] 旧 Vercel / 旧 Supabase のバックアップを取得したうえで廃止
- [ ] GitLab リポジトリの扱い（アーカイブ等）を決める
- [ ] `README.md` の本番 URL を `https://accounting-system.vercel.app/` に更新
- [ ] `grep -rn matter-controller` で旧識別子が残っていないことを確認（`docs/setup.md` のローカル再起動手順も更新対象）
- [ ] [#68](https://github.com/Singuralitylabs/accounting-system/issues/68) をクローズ

## 10. ロールバック

| 発生タイミング                      | 対応                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase B（新環境デプロイ後、切替前） | 利用者は旧を使用中のため**影響なし**。新環境で原因調査。Vercel の Instant Rollback、または `git revert -m 1 <マージコミット>` を `release` へ                                         |
| Phase C（データ移行中）             | 旧環境は無変更。新側の `public` / `auth` の投入分を削除してやり直す（新側に失うものは無い）                                                                                           |
| Phase D 以降（切替後）              | **旧 URL へ戻すのが第一手**（旧環境は無変更のまま残してある）。切替後に新側へ入力されたデータは旧へ戻す必要があるため、切替直後は入力を最小限にし、逆方向の差分移行手順を用意しておく |
| 認証フック起因のログイン不能        | Supabase ダッシュボードで Custom Access Token Hook を無効化するだけで復旧する（middleware が `profiles` へフォールバックする）                                                        |
| 二重プロフィールが発生した場合      | 誤って作られた `profiles` 行を削除し、正しい行の `user_id` を当該利用者の UUID に更新する。案件の再移行は不要                                                                         |

旧環境をすぐに廃止しないこと。これが唯一の実効的なロールバック手段である。

## 11. 周知文の例

> 【経理システム 移行のお知らせ】
> ○月○日（○）○:○〜○:○ にシステムメンテナンスを実施します。
> 作業中は案件の登録・編集ができません。
>
> 作業後、URL が変わります： https://accounting-system.vercel.app/
> （旧 URL は順次アクセスできなくなります。ブックマークの変更をお願いします）
>
> - 移行に伴い、**再度 Google ログインが必要**になります
> - 案件一覧のページが `/matters` に移動しました。トップページからも遷移できます
> - 新機能：定期費用マスタ、経理追加収支、損益計算書の構造変更
