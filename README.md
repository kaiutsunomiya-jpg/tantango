# たんたんご！ PWA v12 — TOPIK専用フォルダ

2026/11/26 更新。既存の単語学習・瞬間作文に加え、ホーム画面から **TOPIK用 → 単語学習／瞬間作文 → CSVセット** と進めます。

## 新しく追加したルート

```text
ホーム「たんたんご！」
├── 単語学習 → 英語／韓国語／中国語 → 通常のCSVセット
├── 瞬間作文 → 英語／韓国語／中国語 → 通常のCSVセット
└── TOPIK用
    ├── 単語学習 → 第47回TOPIKⅡ_上級韓国語100単語（100語）
    └── 瞬間作文 → TOPIK54番作文対策（60文）
```

TOPIK用ルートは韓国語専用のため、言語選択画面を挟みません。2種類のセットは通常メニューには重複表示されません。

## CSVのディレクトリ構成

```text
VocabularySets/
├── Vocabulary/                         ← 通常の単語学習（4/5列CSVなど）
├── Flash/                              ← 通常の瞬間作文（2列CSV、HSKは3列CSV）
├── TOPIK/
│   ├── Vocabulary/
│   │   └── 第47回TOPIKⅡ_上級韓国語100単語.csv
│   └── Flash/
│       └── TOPIK54番作文対策.csv
└── index.json                          ← GitHub Actionsが自動生成する一覧
```

「TOPIK54番作文対策.csv」の内容は今回添付された「TOPIK作文_連続4文_60例文(1).csv」を**改変せず**、ファイル名のみ変更して格納しています（ヘッダー＋60文）。
「第47回TOPIKⅡ_上級韓国語100単語.csv」は添付の `tantango-main(1).zip` からTOPIK専用のVocabularyへ移動しています（100語）。

### GitHubへの更新方法

1. ZIPを解凍し、`tantango-main` フォルダ内のファイル・ディレクトリを**リポジトリのルート**へアップロードしてください（ZIPそのもののアップロードではありません）。
2. `app.js`、`styles.css`、`sw.js`、`index.html`、`scripts/build_site.py`、`VocabularySets/` を反映してください。
3. **必須：** GitHubの古い `VocabularySets/Vocabulary/第47回TOPIKⅡ_上級韓国語100単語.csv` は削除してください。GitHubのWeb UIから新しいファイルをアップロードしても、旧ファイルは自動削除されません。旧版が残ると通常メニューにも表示されてしまいます。
4. `.github/workflows/deploy-pages.yml` はこれまでの **build → deploy** 2ジョブ方式をそのまま同梱しています。すでに同じ構成なら変更不要です。
5. `main` にコミットするとGitHub Actionsがフォルダを再走査して `VocabularySets/index.json` を生成し、公開版へ反映します。`Settings → Pages` のSourceは `GitHub Actions` を使用してください。
6. 既存のホーム画面アプリとGitHub Pages公開URLを**変えずに**、ネット接続した状態で更新後のアプリを開き直してください。

注意：通常フォルダ内の既存CSVは保持していますが、元ZIPに含まれていた `VocabularySets/Flash/副詞瞬間韓国作文.csv` は中身がRTF形式（CSVではない）だったため、読み取り可能なUTF-8の2列CSVに変換しました。元の日本語・韓国語の100例文は保持しています。これを修正しないと自動ビルドが失敗します。

## ⭐復習データについて

IndexedDBの `kotobadeck-local-sets`、`review-flags`、DBバージョン `2` は変更していません。旧「単語学習→韓国語」のTOPIK100単語で付けた⭐は、**移動後のTOPIK専用セットへ引き継ぎ**ます。削除した⭐が再び表示されないよう、移行元のキーも整理します。

アプリをホーム画面から削除したり、Safariのサイトデータを消去したり、公開URLを変更したりすると、⭐データが失われる場合があります。

## これまでの機能

- 2/3/4/5カラムCSVに対応。ヘッダー文字の表記ゆれを許容
- 5列の例文強調（太字＋下線）
- 中国語の原語・拼音・日本語表示
- 単語一覧の例文パネル、選択行を一覧最上部へ移動
- CSV順・ランダム・⭐復習のみの表示とテスト
- テスト中の前へ戻るボタン、進捗ドラッグ（モルモットのアイコン）
- PWAオフラインキャッシュ・スマホ向け表示
- 左下のバージョン表示 `v12:2026/11/26`

## ローカル確認

```bash
python3 scripts/build_site.py
cd dist
python3 -m http.server 8000
```

GitHub Pagesでは `dist/` の内容がActionsにより公開されます。CSVを追加するときは、適切な通常フォルダ、または `VocabularySets/TOPIK/Vocabulary`・`VocabularySets/TOPIK/Flash` へ格納してください。
