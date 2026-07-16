# 🎵 Auto Music Studio

Suno AI と連携し、**24 時間・自動で音楽を生成し続ける**ウェブサイトです。
GitHub Actions が定期的に Suno を呼び出して新曲を生成し、GitHub Pages に公開された
プレイヤーで誰でも聴けます。サーバー不要・追加ホスティング費用ゼロで運用できます。

```
┌──────────────┐   cron(3h毎)   ┌──────────────────┐   保存    ┌─────────────────┐
│ GitHub Actions│ ───────────▶ │ scripts/generate  │ ──────▶ │ data/tracks.json │
│  (自動実行)   │               │  (Suno API 呼出)  │  commit └─────────────────┘
└──────────────┘               └──────────────────┘                 │
                                                                     ▼ push
                                                          ┌──────────────────┐
                                                          │ GitHub Pages 公開 │
                                                          │  index.html (再生) │
                                                          └──────────────────┘
```

---

## ⚠️ 重要な前提（必ずお読みください）

このプロジェクトは Suno の**公式 API ではなく**、ブラウザのログイン Cookie を使った
**非公式な方法**で自動生成しています。そのため次の点にご注意ください。

- **Suno の利用規約に抵触する可能性があります。** 自動化・スクレイピングが規約で
  制限されている場合、アカウントが**停止されるリスク**があります。自己責任でご利用ください。
- Suno 側の仕様変更で**動かなくなることがあります**。その場合は
  `scripts/generate.mjs` 内のエンドポイント定数を更新する必要があります。
- 生成には Suno のクレジットを消費します。無料枠には上限があるため、生成頻度は
  クレジット消費に見合うよう `.github/workflows/generate.yml` の `cron` で調整してください。

> より安定した運用が必要な場合は、Suno を正式に再販するサードパーティ API
> （sunoapi.org など、有料）への切り替えを検討してください。その場合は
> `getJwt()` と `requestGenerate()` を各サービスの仕様に合わせて書き換えます。

---

## 🚀 セットアップ手順

### 1. Suno の Cookie を取得する

1. [suno.com](https://suno.com) にログインする
2. ブラウザの開発者ツールを開く（F12）→ **Network** タブ
3. ページを操作して `clerk.suno.com` へのリクエストを見つける
4. そのリクエストの **Request Headers** にある `Cookie:` の値を**丸ごとコピー**する

### 2. GitHub Secrets に登録する

このリポジトリの **Settings → Secrets and variables → Actions → New repository secret** で登録：

| Name          | Value                              |
| ------------- | ---------------------------------- |
| `SUNO_COOKIE` | 手順1でコピーした Cookie 文字列全体 |

### 3. GitHub Pages を有効化する

**Settings → Pages** で：

- **Source** を `GitHub Actions` に設定

これで `main` に push されるたびにサイトが自動デプロイされます。

### 4. 最初の生成を実行する

**Actions → Generate Music → Run workflow** を押して手動実行します。
数分後に `data/tracks.json` へ新曲が追記され、サイトに表示されます。

以降は `cron`（既定で 3 時間ごと）で自動的に生成が続きます。

---

## 🔧 カスタマイズ

### 生成頻度を変える

`.github/workflows/generate.yml` の `cron` を編集します。

```yaml
- cron: "0 */3 * * *"   # 3時間ごと（既定 / 1日8回）
- cron: "0 * * * *"     # 毎時（1日24回・クレジット消費大）
- cron: "0 */6 * * *"   # 6時間ごと（1日4回）
```

> GitHub の cron はベストエフォートで、混雑時は数分〜十数分遅れることがあります。

### 生成テーマを変える

- **固定テーマ**にしたい: Actions のシークレット/変数、または `generate.yml` の
  `env` に `SUNO_PROMPT` を設定します。
- **ランダム**（既定）: `scripts/generate.mjs` の `RANDOM_THEMES` 配列を編集すると、
  自動生成時のテーマ候補を差し替えられます。

### インスト（歌なし）曲にする

手動実行時に `instrumental` を `true` にするか、`generate.yml` の `env` に
`MAKE_INSTRUMENTAL: "true"` を追加します。

---

## 🖥 ローカルで確認する

```bash
# 依存なし。静的サーバーで開くだけ
npm run serve       # → http://localhost:8000

# 手元で生成を試す（Cookie が必要）
SUNO_COOKIE='＜コピーしたCookie＞' npm run generate
```

---

## 📁 構成

```
.
├── index.html                    # フロントエンド（音楽プレイヤー）
├── data/tracks.json              # 生成済み楽曲のデータベース
├── scripts/generate.mjs          # Suno 呼び出し＆生成スクリプト
├── .github/workflows/
│   ├── generate.yml              # 定期生成（cron）
│   └── deploy.yml                # Pages 自動デプロイ
├── package.json
└── README.md
```

## 📜 ライセンス

MIT. 生成された楽曲の権利・利用条件は Suno の規約に従います。
