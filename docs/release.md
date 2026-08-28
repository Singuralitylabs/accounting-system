# リリース／カットオーバー手順書

本番反映の手順書。対象は次の 2 つの作業であり、**両者は独立して実施できない**（理由は 1.2）。

| 作業           | 内容                                                                 | 追跡                                                                  |
| -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| リリース       | `main` の実装を `release` ブランチへ反映し本番デプロイする           | 本書                                                                  |
| カットオーバー | 本番を旧 `matter-controller` から新 `accounting-system` へ一本化する | [#68](https://github.com/Singuralitylabs/accounting-system/issues/68) |

## 1. 前提と作業順序

### 1.1 現状

|                    | 旧（現行本番）                          | 新（切替先）                                                 |
| ------------------ | --------------------------------------- | ------------------------------------------------------------ |
| Vercel             | `https://matter-controller.vercel.app/` | `https://accounting-system.vercel.app/`                      |
| Supabase           | 旧プロジェクト                          | 新プロジェクト                                               |
| スキーマ           | マイグレーション導入前の手適用スキーマ  | 同期済みスナップショット（マイグレーション適用状況は要確認） |
| 利用者             | **こちらを使用中**                      | 未誘導                                                       |
| デプロイ元ブランチ | **要確認**                              | **要確認**                                                   |

`release` ブランチに未反映の `main` コミットは **53 件 / 226 ファイル**（+17,142 / −5,030）。

### 1.2 なぜリリースとカットオーバーを分離できないか

- `main` には DB マイグレーション 17 本が含まれ、うち **10〜17 は `release` 時点のスキーマに存在しない**変更（新テーブル 2 つ、`profiles` の RLS 厳格化、認証フック、GRANT 復元）。
- 新 Supabase は `main` 相当のスキーマで構築されている。ここに**旧コード**を載せると `getAllUserInfo()`（`profiles` 全件 SELECT）などが RLS 厳格化に阻まれて壊れる。
- 逆に旧 Supabase に**新コード**を載せると、`recurring_costs` / `extra_entries` が存在せず `/recurring-costs` `/extra-entries` `/profit-loss` が動かない。
- したがって整合する組み合わせは「**新環境 × 新コード**」のみ。リリースとカットオーバーは同一のメンテナンスウィンドウで完了させる。

### 1.3 作業順序

```
Phase A 事前準備（無停止・数日前でも可）
   ↓
Phase B 新環境へリリース（利用者はまだ旧を使用。新環境で本番検証）
   ↓
Phase C メンテナンス（旧の書き込み停止 → 差分データ移行 → 突合）
   ↓
Phase D 切替（利用者を新 URL へ誘導、旧を読み取り専用化）
   ↓
Phase E 切替直後の確認
   ↓
Phase F 監視 → 旧環境廃止 → リポジトリ後片付け
```

Phase A・B は利用者影響なしで先行実施できる。当日のメンテナンス時間に入れるのは Phase C 以降のみ。

## 2. 着手前に確定させる事項

以下が未確定のまま進めると事故になる。**すべて Phase A の前に確認する。**

| #   | 確認事項                                                                        | 確認場所                                                   | 未確認のまま進めた場合                                                                                         |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | **旧 Vercel プロジェクトが本リポジトリの `release` ブランチに接続されているか** | Vercel（旧プロジェクト）→ Settings → Git                   | `release` へのマージが旧本番に新コードを配信し、旧 Supabase に無いテーブルを参照して**現行本番が即座に壊れる** |
| 2   | 新 Vercel プロジェクトの Production Branch はどれか（`release` か `main` か）   | Vercel（新プロジェクト）→ Settings → Git                   | リリースしたつもりで本番が更新されない                                                                         |
| 3   | 新 Supabase のマイグレーション適用状況                                          | `supabase migration list`（新プロジェクトに接続後）        | 未適用分を見落とし、切替後に 403 やテーブル不存在が発生する                                                    |
| 4   | 新 Supabase の `auth.users` と旧の UUID が一致しているか                        | 両プロジェクトの `auth.users` を email で突合              | `profiles.user_id` の外部キーが解決できず、データ移行が失敗する（3.4 参照）                                    |
| 5   | 新 URL で汎用 Sign in 画面が出る原因（#68 の WARNING）                          | Vercel（新プロジェクト）→ Settings → Deployment Protection | 切替後に**全利用者がログインできない**                                                                         |
| 6   | 新 Supabase に既に業務データ（定期費用・追加収支など）が入力されているか        | 新 DB の各テーブル件数                                     | Phase C のデータ入れ替えで消失する（6.3 の退避が必要）                                                         |

`ignore-step.sh` は `main` / `release` の両ブランチでビルドを許可しているため、**ブランチ名だけではどちらの Vercel プロジェクトがどこにデプロイされるか判別できない**。必ず Vercel のコンソールで確認する。

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

`supabase/migrations/` の 17 本。うち 01〜09（`20260523*`）は既存スキーマの再現、10〜17 が新規変更。

### 3.3 Custom Access Token Hook

`public.custom_access_token_hook` を Supabase ダッシュボード（Authentication → Hooks）で有効化する。

- **マイグレーション適用後に有効化する。** 関数が存在しない状態で有効化するとトークン発行自体が失敗し、**全ユーザーがログイン不能**になる。
- 有効化を忘れた場合は `middleware.ts` が `profiles` への DB クエリにフォールバックするため動作はする（性能が戻るだけ）。詳細は `docs/database.md` 7 章。

### 3.4 データ移行で最も危険な点

`profiles.user_id` は `auth.users(id)`（UUID）への外部キー。**旧 Supabase と新 Supabase は別プロジェクトのため、同じ利用者でも `auth.users.id` は原則一致しない。**

- 一致している場合（`auth.users` ごと移行済み）: `profiles` をそのまま投入できる。
- 一致していない場合: `profiles.user_id` を **email をキーに新側の UUID へ張り替えて**投入する。張り替えを忘れると外部キー違反で移行が失敗する。

`matters.user_id` は `profiles.id`（bigint）を参照するため、**`profiles.id` の値は旧のまま保持する**こと。

## 4. Phase A — 事前準備（無停止）

- [ ] 2 章の 6 項目をすべて確認する
- [ ] `main` 最新（`a72abee`）で CI 4 本（typecheck+lint / test / build / format-check）が green
- [ ] 新 Vercel の Environment Variables（Production スコープ）が**新** Supabase を指している
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SLACK_WEBHOOK_URL`
- [ ] 新 Vercel の Deployment Protection を Production で無効化（#68 の WARNING の解消）
- [ ] Google Cloud Console の OAuth クライアントに新ドメインのコールバック URL を登録
- [ ] 新 Supabase の Authentication → URL Configuration の Site URL / Redirect URLs が新ドメイン
- [ ] 新 Supabase のマイグレーション状態を確認する（プロジェクトへ接続後 `supabase migration list`）
- [ ] 未適用分があれば適用する（`--dry-run` で内容を確認してから実行し、適用後に `supabase migration list` で全件 applied を確認）

> リモートの履歴が空でスキーマだけ存在する場合は、**実スキーマと突き合わせて**既適用分の履歴のみを `supabase migration repair --status applied <version...>` で埋める（SQL は実行されない）。対象の判断を誤ると、必要な変更が飛ばされるか `already exists` で適用が落ちる。01〜09 に対応するバージョンは `20260523053648` / `20260523053709` / `20260523053721` / `20260523053734` / `20260523053819` / `20260523053842` / `20260523053903` / `20260523054417` / `20260523054431`。

- [ ] マイグレーション適用後に Custom Access Token Hook を有効化（3.3）
- [ ] 新環境でテストアカウントが協会ドメインの Google 認証でログインできる
- [ ] 旧 Supabase のバックアップを取得（Database → Backups もしくは `supabase db dump`）
- [ ] 新 Supabase のバックアップを取得（切り戻し用）
- [ ] 利用者へ切替日時・新 URL・**再ログインが必要な旨**・案件一覧 URL の変更を事前周知

## 5. Phase B — 新環境へのリリース

### 5.1 main → release のマージ

2 章 #1 で旧 Vercel が `release` に接続されている場合は、**マージ前に旧プロジェクトの自動デプロイを停止する**（Git 連携の解除、または Ignored Build Step で常時スキップ）。旧環境は Phase D まで現行のまま動かし続ける必要がある。

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

`docs/testing.md` 3.7「手動確認（RLS・権限クラス別）」に沿って、`public` / `teamleader` / `accounting` / `admin` の 4 クラスで確認する。

- [ ] ログイン（協会ドメイン限定、ドメイン外は拒否）
- [ ] 案件の一覧・作成・編集・コピー・削除、経理申請、経理確認完了、差し戻し検知
- [ ] `/accounting` `/team` `/profit-loss` `/recurring-costs` `/extra-entries` `/dashboard` の可否がロール通り
- [ ] Slack 通知（**本番チャンネルに飛ぶ**ため、テストである旨を添えるか事前に周知する）

> 検証で投入したデータは Phase C のデータ入れ替えで消える。逆に、既に業務データを新環境へ入力している場合（定期費用マスタなど）は 6.3 で退避すること。

## 6. Phase C — メンテナンス（書き込み停止と差分データ移行）

ここからが停止時間。所要は概ね 30〜60 分（データ量による）。

### 6.1 旧環境の書き込み停止

- [ ] メンテナンス開始を周知
- [ ] 旧アプリの書き込みを止める（メンテナンス表示、または旧 Vercel プロジェクトの一時停止）

### 6.2 旧 Supabase から最終ダンプ

接続文字列は各プロジェクトの Settings → Database から取得する。

```
OLD_DB_URL = postgresql://postgres:<pass>@db.<旧ref>.supabase.co:5432/postgres
NEW_DB_URL = postgresql://postgres:<pass>@db.<新ref>.supabase.co:5432/postgres
```

1. **列構成の差分を先に確認する。** 新旧で `\d public.matters` などを比較する。新側に無い列が旧側にあると投入が失敗する（新側にのみある列は既定値で埋まるため問題ない）。
2. **データのみをダンプする。**

```bash
pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
  -t public.profiles -t public.matters -t public.costs -t public.business \
  > old_data.sql
```

`--column-inserts` は使わない。`costs` / `business` は `GENERATED ALWAYS AS IDENTITY` のため、INSERT 形式では `OVERRIDING SYSTEM VALUE` が必要になる。既定の COPY 形式でダンプする。

`select_option_types` / `select_options` はマイグレーション 06 で新側に初期データが投入済み。旧側で選択肢を追加している場合のみ、差分を `ON CONFLICT DO NOTHING` で流し込む（`matters.team` / `category` は text 列で外部キーではないため、id の一致は不要）。

### 6.3 新 Supabase への投入

1. 新側の業務データ（`recurring_costs` / `extra_entries`）がある場合は先に退避する。**`extra_entries` は `profiles` を参照するため、`profiles` の入れ替え時に連鎖して消える。**
2. 対象 4 テーブル（`costs` / `business` / `matters` / `profiles`）を空にし、`old_data.sql` を投入する。
3. 退避した `recurring_costs` / `extra_entries` を書き戻す。
4. `auth.users` の UUID が新旧で一致していない場合は、投入前に `profiles.user_id` を email で張り替える（3.4）。

投入後、**採番シーケンスを必ず進める**（怠ると次の登録が主キー重複で失敗する）。

```sql
SELECT setval(pg_get_serial_sequence('public.profiles','id'),        COALESCE((SELECT MAX(id) FROM public.profiles), 1));
SELECT setval(pg_get_serial_sequence('public.matters','id'),         COALESCE((SELECT MAX(id) FROM public.matters), 1));
SELECT setval(pg_get_serial_sequence('public.costs','id'),           COALESCE((SELECT MAX(id) FROM public.costs), 1));
SELECT setval(pg_get_serial_sequence('public.business','id'),        COALESCE((SELECT MAX(id) FROM public.business), 1));
SELECT setval(pg_get_serial_sequence('public.select_options','id'),  COALESCE((SELECT MAX(id) FROM public.select_options), 1));
SELECT setval(pg_get_serial_sequence('public.recurring_costs','id'), COALESCE((SELECT MAX(id) FROM public.recurring_costs), 1));
SELECT setval(pg_get_serial_sequence('public.extra_entries','id'),   COALESCE((SELECT MAX(id) FROM public.extra_entries), 1));
```

### 6.4 突合

新旧両方で実行し、件数と最終更新日時が一致することを確認する。

```sql
SELECT 'profiles' AS t, count(*), max(updated_at) FROM profiles
UNION ALL SELECT 'matters',  count(*), max(updated_at) FROM matters
UNION ALL SELECT 'costs',    count(*), max(updated_at) FROM costs
UNION ALL SELECT 'business', count(*), max(updated_at) FROM business;
```

- [ ] 4 テーブルの件数が一致
- [ ] `max(updated_at)` が一致
- [ ] 直近の案件を数件、画面で開いて金額・取引先・コストが一致
- [ ] 孤児レコードが無い（`matters.user_id` / `costs.matter_id` / `business.matter_id` が解決できる）

## 7. Phase D — 切替

- [ ] 利用者へ新 URL を案内（再ログインが必要な旨を再掲）
- [ ] 旧 URL に「新環境へ移動」バナーを出す、または読み取り専用にする
- [ ] 旧 Supabase を読み取り専用にする（誤入力の防止）

## 8. Phase E — 切替直後の確認

新 URL で実データに対して確認する。

- [ ] Google ログイン（協会ドメイン）
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
- [ ] `README.md` の本番 URL を `https://accounting-system.vercel.app/` に更新
- [ ] `grep -rn matter-controller` で旧識別子が残っていないことを確認（`docs/setup.md` のローカル再起動手順も更新対象）
- [ ] [#68](https://github.com/Singuralitylabs/accounting-system/issues/68) をクローズ

## 10. ロールバック

| 発生タイミング                      | 対応                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase B（新環境デプロイ後、切替前） | 利用者は旧を使用中のため**影響なし**。新環境で原因調査。Vercel の Instant Rollback、または `git revert -m 1 <マージコミット>` を `release` へ                                         |
| Phase C（データ移行中）             | 旧環境は無変更。新側を Phase A のバックアップから復元してやり直す                                                                                                                     |
| Phase D 以降（切替後）              | **旧 URL へ戻すのが第一手**（旧環境は無変更のまま残してある）。切替後に新側へ入力されたデータは旧へ戻す必要があるため、切替直後は入力を最小限にし、逆方向の差分移行手順を用意しておく |
| 認証フック起因のログイン不能        | Supabase ダッシュボードで Custom Access Token Hook を無効化するだけで復旧する（middleware が `profiles` へフォールバックする）                                                        |

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
