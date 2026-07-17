# 🎵 Auto Music Studio

Suno AI で作った曲を集めて公開する音楽プレイヤーサイトです。
GitHub Pages でホストされ、追加費用なしで運用できます。

> **経緯メモ**：当初は GitHub Actions で 24 時間自動生成していましたが、Suno が
> 自動アクセス（ボット）を CAPTCHA でブロックするようになったため、
> **手動追加方式**に切り替えました。Suno で作った曲をブラウザから簡単に追加できます。

---

## 🎧 使い方

### サイトを見る

公開URL: **https://duke24510studio-dotcom.github.io/-suno-auto-music/**

曲をタップすると再生できます。シャッフル・自動連続再生に対応。

### 曲を追加する

1. [Suno](https://suno.com) で曲を作る
2. その曲を開き、**URL（`https://suno.com/song/...`）をコピー**
3. サイト右上の **「＋ 曲を追加」** を開く（`/add.html`）
4. 初回だけ **GitHubトークン**を入力（画面の説明どおり作成。以降は不要）
5. 曲リンクとタイトルを入れて **「サイトに追加する」**

→ 1〜2分でサイトに反映されます。

> 💡 曲は **Public（公開）** 設定にしておくと確実に再生できます。
> Suno の曲ページで公開状態にしてから追加してください。

---

## 📁 構成

```
.
├── index.html          # 音楽プレイヤー（トップページ）
├── add.html            # 曲を追加するページ（GitHub API で保存）
├── data/tracks.json    # 曲のデータベース
├── .github/workflows/
│   └── deploy.yml      # push のたびに Pages へ自動デプロイ
├── package.json
└── README.md
```

## ⚙️ 仕組み

- `add.html` が GitHub API 経由で `data/tracks.json` に曲を追記（push）
- push を合図に `deploy.yml` が動き、サイトを再デプロイ
- 音声・画像は Suno の CDN（`cdn1.suno.ai` / `cdn2.suno.ai`）を参照

## 🖥 ローカルで確認する

```bash
npm run serve   # → http://localhost:8000
```

## 📜 ライセンス

MIT. 生成された楽曲の権利・利用条件は Suno の規約に従います。
