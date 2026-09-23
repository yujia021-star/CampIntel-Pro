# campintel

個人用のキャンプ管理・アドバイスアプリ（身内利用・招待制）。
Next.js (App Router) + Supabase + Claude API で動きます。

- **プラン診断**: キャンプ計画・マイギア・直近5件の日記をまとめて1回のAI呼び出しで診断（リスク・推奨タグ・所持ギアとのマッチング・パッキングリスト・総合アドバイス）。結果は `camp_plans` に履歴として保存
- **マイギア**: ギア名入力の0.7秒後にAIがタグ・カテゴリを提案（手動編集した項目は上書きしない）／📷 写真から認識（Claude Vision）／定番装備フラグ
- **日記**: タップで記録、8種の達成バッジ、次回診断のプロンプトに反映
- **履歴**: 過去の診断結果を閲覧・削除

`legacy/index.html` は以前の Google Apps Script 版プロトタイプです（参考用に残しています）。

## セットアップ

### 1. Supabase

1. [supabase.com](https://supabase.com) でプロジェクトを作成（無料枠）
2. SQL Editor で `supabase/migrations/20260923000000_init.sql` を実行（Supabase CLI を使う場合は `supabase db push`）
3. 身内のメールアドレスを許可リストに登録（ここにないアドレスはアカウント作成がDB側で拒否されます）
   ```sql
   insert into public.allowed_emails (email, note) values
     ('you@example.com', '自分'),
     ('family@example.com', '家族');
   ```
4. Authentication → URL Configuration
   - Site URL: 本番URL（例: `https://campintel.vercel.app`）
   - Redirect URLs: `http://localhost:3000/auth/confirm` と `https://<本番ドメイン>/auth/confirm`
5. （推奨）Authentication → Email Templates → Magic Link のリンクを次に変更すると、メールを別の端末で開いてもログインできます
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink
   ```
   ※ Supabase 無料枠の標準メール送信は1時間あたりの上限が小さいので、利用者が増えたら SMTP 設定を検討してください。

### 2. 環境変数

`.env.example` を `.env.local` にコピーして値を入れます（`.env.local` は Git に含めません）。

| 変数 | 内容 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の anon / publishable key |
| `ANTHROPIC_API_KEY` | Anthropic API キー（サーバー側のみで使用） |
| `NEXT_PUBLIC_SITE_URL` | マジックリンクの戻り先のベースURL |
| `ANTHROPIC_MODEL` | 任意。既定は `claude-sonnet-5` |
| `AI_HOURLY_LIMIT` | 任意。1ユーザー1時間あたりのAI呼び出し上限（既定 30） |

### 3. ローカル起動

```bash
npm install
npm run dev        # http://localhost:3000
```

### 4. Vercel へデプロイ

1. Vercel で GitHub リポジトリをインポート
2. Project Settings → Environment Variables に上の環境変数を登録（`NEXT_PUBLIC_SITE_URL` は本番URL）
3. デプロイ後、Supabase の Redirect URLs に本番の `/auth/confirm` を追加

## 開発

```bash
npm run typecheck
npm run lint
npm test           # 診断の後処理・バッジ・タグ・入力検証のユニットテスト
npm run build
```

## 設計メモ（プロトタイプで踏んだ落とし穴への対策）

| 落とし穴 | 対策 |
|---|---|
| AI呼び出しが複数回で遅い | 診断は `/api/diagnose` で1回の呼び出しにまとめている |
| 必須要件をAI任せにする | 定番装備の強制追加、存在しない `gear_id` の破棄、重複除去を `lib/diagnosis.ts` の `finalizeDiagnosis` でコード側保証（テストあり） |
| 自動提案のレースで手動編集が上書きされる | `GearForm` で手動編集フラグ（ref）とリクエスト番号を持ち、古い応答や編集済み項目への反映を捨てる |
| JSON例文に書式指示が混ざる | 構造化出力（`output_config.format` + Zod スキーマ）で形式を縛り、文字数などの指示は system プロンプト本文に分離 |
| 数値指標の不一致 | 準備度%・カバー件数・リスクレベルは同じ後処理済みパッキングリスト／リスク一覧から計算 |

### セキュリティ

- 全テーブルで RLS を有効化し、`user_id = auth.uid()` の行のみ読み書き可能
- anon キーは公開される前提のため、招待制は `auth.users` への INSERT トリガー（`allowed_emails`）でDB側で強制
- Anthropic API キーはサーバー（Route Handler）のみで使用。AI呼び出しは認証必須＋DBベースのレート制限（`ai_requests`）

### エラーコード（AI系API）

| code | HTTP | 状況 |
|---|---|---|
| `invalid_json` | 502 | 構造化出力のパース失敗・出力が途中で切れた |
| `rate_limited` | 429 | Anthropic 側のレート制限、またはアプリの1時間上限 |
| `refused` | 422 | モデルが応答を拒否 |
| `overloaded` | 503 | Anthropic 側の過負荷 |
| `api_error` | 502 | その他 |

## 今後（未実装）

- `campsites` マスタによる標高・地形の自動入力
- 「要準備」ギアへのアフィリエイトリンク
- エラーログ収集（Sentry 無料枠など）
