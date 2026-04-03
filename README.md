# Zendesk Help Center Articles Exporter

Two tools for bulk-exporting Zendesk Help Center articles:

1. **Chrome extension** — Fetches articles in bulk from the Help Center and downloads them in one click as **CSV** or **Markdown**.
2. **Python CLI** — Uses the Help Center API to list articles as **CSV** or **JSON**.

Zendesk Help Center の記事を一括出力するための2つのツールがあります。
1. **Chrome 拡張機能**：Zendesk の Help Center から記事を一括で取得し、**CSV** または **Markdown** としてワンクリックでダウンロードできます。
2. **Python CLI**：Help Center API を使い、**CSV** または **json** で記事一覧を取得します。

**Repository layout / リポジトリ構成**

* `extension/` — Chrome extension / Chrome 拡張
* `python/` — CLI `list_articles.py` / 記事一覧用 CLI

---

## Chrome拡張機能についての英語の説明

Chrome extension (Manifest V3) that bulk-fetches articles from Zendesk Help Center and downloads them as **CSV** or **Markdown**.

What is exported depends on login state:

* Signed in → all articles you are allowed to see
* Not signed in → public articles only

### Features

* Run from the popup while a Help Center page is open
* Choose output format: **CSV** (single file) or **Markdown** (one file per locale)
* Fetches articles for **all** Help Center locales
* CSV includes both **HTML** body (`body`) and **Markdown** body (`body_markdown`)

Markdown conversion uses [Turndown](https://github.com/mixmark-io/turndown) (MIT License).

### Requirements

* Chrome (Manifest V3)
* Zendesk Help Center (content scripts match `https://*/hc/*`)

### Usage

#### 1. Open Help Center

Example:

```
https://yourdomain.zendesk.com/hc/ja
```

#### 2. Choose format and export

Click the extension icon → under **Format**, choose **CSV** or **Markdown** → click **Export articles**.

#### 3. Downloaded files

**CSV (one file)**

* Example filename: `yourdomain_zendesk_com_YYYY-MM-DD-HH-mm-ss.csv` (unsafe hostname characters become `_`)
* First row is English column headers. Body columns include `body` (HTML) and `body_markdown`.

**Markdown (per locale)**

* Example filename: `zendesk_articles_ja_YYYY-MM-DD-HH-mm-ss.md`
* Within a locale, each article is `# title` plus Markdown body; articles are separated by `---`.
* If multiple locales are enabled, one file per locale is downloaded in sequence.

### Limitations

* The API returns only articles you are allowed to view: when logged out → public articles only; when logged in → articles within your permissions
* Accessing non-public articles requires appropriate permissions
* On multilingual Help Centers, when the locales API works, **all** locales are fetched in order

---

## python cliについての英語の説明

Uses the same Help Center API as the extension (`locales.json` → per-locale `articles.json`, with `links.next` pagination) to list articles.

**Requirements:** Python 3.8+, `pip install -r python/requirements.txt`

**Examples**

```bash
cd python
pip install -r requirements.txt
# Public articles only (no auth)
python list_articles.py --subdomain yourdomain --format json
# Base URL
python list_articles.py --base-url https://yourdomain.zendesk.com -o articles.json
# Email + API token (non-public articles within your permissions, etc.)
python list_articles.py --subdomain yourdomain --email you@example.com --token YOUR_API_TOKEN --format csv -o articles.csv
```

* Either **omit both** `--email` and `--token` (public articles only) or **pass both** (HTTP Basic auth).
* If the locales API is unavailable, specify a locale explicitly, e.g. `--locale ja`.
* JSON output is a JSON array of **full article objects** as returned by the Help Center API.
* CSV uses the same columns as the extension’s article CSV (including `body` and `body_markdown`). The CLI generates `body_markdown` with [markdownify](https://github.com/matthewwithanm/python-markdownify). Array/object fields are stored as JSON strings in the cell.
* Tokens on the command line may remain in **shell history** or **`ps`** output; be careful on shared machines.

---

## Chrome拡張機能について

Zendesk の Help Center から記事を一括取得し、**CSV** または **Markdown** としてダウンロードできる Chrome 拡張機能です。

ログイン状態に応じて、取得対象が自動で切り替わります。

* ログイン済み → 権限内のすべての記事
* 未ログイン → 公開記事のみ

### 特徴

* Help Center のページを開いた状態で、ポップアップから実行
* 出力形式を選択可能：**CSV**（1ファイル） / **Markdown**（ロケールごとに1ファイル）
* Help Center の**すべてのロケール**の記事を対象に取得
* CSV には本文の **HTML**（`body`）と **Markdown 変換された本文**（`body_markdown`）の両方を含む

Markdown 変換には [Turndown](https://github.com/mixmark-io/turndown)（MIT License）を使用しています。

### 対応環境

* Chrome（Manifest V3）
* Zendesk Help Center（コンテンツスクリプトは `https://*/hc/*` にマッチ）

### 使い方

#### 1. Zendesk のヘルプセンターを開く

例：

```
https://yourdomain.zendesk.com/hc/ja
```

#### 2. 形式を選んで実行

拡張アイコンをクリック → **Format** で **CSV** または **Markdown** を選ぶ → **Export articles** をクリック

#### 3. ファイルのダウンロード

**CSV（1ファイル）**

* ファイル名の例：`yourdomain_zendesk_com_YYYY-MM-DD-HH-mm-ss.csv`（ホスト名の記号は `_` に置換）
* 先頭行は英語の列名。本文は `body`（HTML）と `body_markdown` の列を含みます。

**Markdown（ロケールごと）**

* ファイル名の例：`zendesk_articles_ja_YYYY-MM-DD-HH-mm-ss.md`
* 同一ロケール内の記事は、記事ごとに `# タイトル` と本文（Markdown）を並べ、記事間は `---` で区切ります。
* ロケールが複数ある場合は、ロケールごとに別ファイルが順にダウンロードされます。

### 制約

* API は「閲覧可能な記事のみ」を返します

  * 未ログイン → 公開記事のみ
  * ログイン → 権限内の記事
* 非公開記事の取得には適切な権限が必要です
* 多言語 Help Center では、ロケール API が使える場合は **全ロケール**を順に取得します

---

## Python CLIについて

拡張と同じ Help Center API（`locales.json` → ロケールごとの `articles.json`、`links.next` でページング）で記事一覧を取得します。

**必要なもの:** Python 3.8 以上、`pip install -r python/requirements.txt`

**例**

```bash
cd python
pip install -r requirements.txt
# 認証なし（公開記事のみ）
python list_articles.py --subdomain yourdomain --format json
# ベース URL を指定
python list_articles.py --base-url https://yourdomain.zendesk.com -o articles.json
# メール + API トークン（権限内の非公開記事など）
python list_articles.py --subdomain yourdomain --email you@example.com --token YOUR_API_TOKEN --format csv -o articles.csv
```

* `--email` と `--token` は**両方とも省略**（公開のみ）か**両方指定**（HTTP Basic 認証）のどちらかにしてください。
* ロケール API が使えない場合は `--locale ja` のようにロケールを明示してください。
* JSON は Help Center API が返す**記事オブジェクトをそのまま**配列で出力します。
* CSV は拡張の記事 CSV と同じ列（`body` / `body_markdown` を含む）。CLI の `body_markdown` は [markdownify](https://github.com/matthewwithanm/python-markdownify) で生成。配列・オブジェクト型の列はセル内を JSON 文字列にします。
* トークンをコマンド引数にすると**シェル履歴**や **ps** に残ることがあります。共有端末では注意してください。
