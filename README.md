# たんたんご！ PWA v11 — 2026/11/25

GitHub Pagesで使う無料の単語学習PWAです。**学習モード → 言語 → CSVセット → 一覧／テスト**で進みます。

## v11の変更点

1. **すべての画面の左下**に、小さなグレーの `v11:2026/11/25` を表示。
2. **テスト進捗バーの先端にモルモットのアプリアイコン**を表示。
3. 進捗バーのアイコンを**指でドラッグして問題番号を移動**できます。途中の数字は右上のカウンターに表示され、指を離すとその問題へ移動します。
4. ドラッグで移動した先は**解答を隠した状態**から始まります。CSV順／ランダム順／⭐復習だけのテストのいずれでも現在のテスト出題順が使われます。
5. PCではマウスでドラッグ、キーボードではフォーカス後に `← →` や `Home / End` でも移動できます。

前の問題へ戻るボタン、⭐復習、2列・3列・4列・5列のCSV、言語別メニュー、オフラインキャッシュ等は維持しました。

## 今回のデータと公開用ファイル

- v10の**27セット**の初期CSVに加え、以前アップロードされた `TOPIK2_瞬間作文_296例文.csv` （ヘッダー追加済み）を `VocabularySets/Flash` に同梱しています。
- `scripts/build_site.py` は引き続きフォルダ内のCSVを自動収集します。
- `.github/workflows/deploy-pages.yml` は、**build → deploy の2ジョブ構成**の最新版を同梱しています。
- GitHub PagesでのCSV追加時は `VocabularySets/Flash` または `VocabularySets/Vocabulary` に追加してコミットしてください。

## GitHubへ更新する方法

### アプリの表示と操作だけ更新する場合（推奨）

同じリポジトリと公開URLを維持し、下記の**4ファイルを上書き**して `main` にコミットします。

```text
index.html
app.js
styles.css
sw.js
```

`sw.js` のキャッシュ名は `tantango-pwa-v11` で、`app.js` と `styles.css` の読み込みURLも `?v=11` に更新済みです。GitHub Actionsによるデプロイが完了したらオンライン状態でアプリを開き直してください。

### ZIPのファイルセットを丸ごと反映する場合

- ZIPを解凍した中身を、`index.html` がリポジトリ直下になるように配置してください。
- **GitHub上で以前に編集したCSVを上書きしないでください。** ZIPには以前のサンプルCSVが含まれているため、CSVフォルダは現在のGitHub上のファイルを優先してください。
- `.github/workflows/deploy-pages.yml` を更新する場合は、すでに2ジョブ構成で動いていれば変更不要です。必要なときだけ内容を貼り替えてください。
- デプロイ後、GitHub PagesのURLはこれまでと同じです。

## 保存済みの⭐データ

IndexedDBの名前 `kotobadeck-local-sets`、ストア `review-flags`、DBバージョン `2` は変更していません。**既存のPWAを削除しない**で更新してください。サイトデータ消去・端末変更・CSVのファイル名や内容の変更では、復習情報が失われたり関連付けられなくなったりする場合があります。

## 手動テスト

```bash
python3 scripts/build_site.py
cd dist
python3 -m http.server 8000
```

PCのブラウザで `http://localhost:8000/` を開けます。GitHub Pagesでは `dist/` が自動デプロイ対象です。
