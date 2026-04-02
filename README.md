Help Center Articles Exporter for Zendesk

Zendesk の Help Center から記事を一括取得し、CSVとしてダウンロードできる Chrome 拡張です。

ログイン状態に応じて、取得対象を自動で切り替えます。

* 🔐 ログイン済み → 権限内のすべての記事
* 🌐 未ログイン → 公開記事のみ

---

## ✨ 特徴

* ナレッジベース上でワンクリック実行
* cookie付きリクエスト
* cursor pagination による全件取得
* CSVでダウンロード
* 本文（HTML → テキスト）も含めて出力

---

## 🧩 対応環境

* Chrome（Manifest V3）
* Zendesk Help Center（`/hc/` 配下）

---

## 🚀 使い方

### 1. Zendeskのヘルプセンターを開く

例：

```
https://yourdomain.zendesk.com/hc/ja
```

### 2. 実行

拡張アイコンをクリック → 「記事をCSV出力」

### 3. CSVダウンロード

自動で以下の形式のファイルがダウンロードされます：

```
{domain}_YYYY-MM-DD-HH-mm-ss.csv
```

## 🌐 API仕様

使用している主なエンドポイント：

* `GET /api/v2/help_center/{locale}/articles.json`

## ⚠️ 制約

* APIは「閲覧可能な記事のみ」を返します

  * 未ログイン → 公開記事のみ
  * ログイン → 権限内の記事
* 非公開記事の取得には適切な権限が必要です
* 多言語記事は locale ごとに取得されます