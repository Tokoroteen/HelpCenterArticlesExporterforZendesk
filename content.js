// ポップアップなどから送られたメッセージを受け取り、ヘルプセンター記事のCSVエクスポートを開始する
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXPORT_ZENDESK_ARTICLES") {
    exportArticles()
      .then((count) => sendResponse({ ok: true, count }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    // true を返すと非同期処理完了後も sendResponse を呼べる（Manifest V3 の慣用パターン）
    return true;
  }
});

// 現在のサイトから Help Center API で全記事を取得し、CSV をダウンロードする。戻り値は出力した記事件数
async function exportArticles() {
  const origin = location.origin;

  const locales = await resolveLocalesForExport(origin);
  const articles = [];
  for (const locale of locales) {
    articles.push(...(await fetchAllArticles(origin, locale)));
  }

  const csv = articlesToCsv(articles, origin);
  // ファイル名に日時を入れて、上書きしにくくする（例: zendesk_articles_2026-04-03-12-30-00.csv）
  const filename = `zendesk_articles_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;

  downloadCsv(csv, filename);

  return articles.length;
}

// URL（/hc/{locale}）やページの lang からヘルプセンターのロケールを推定
function detectLocale() {
  const match = location.pathname.match(/^\/hc\/([^/]+)/);
  if (match?.[1]) return match[1];

  const htmlLang = document.documentElement.lang?.trim();
  if (htmlLang) return htmlLang;

  throw new Error(
    "Could not detect Help Center locale from the URL or <html lang>. Open a page whose path includes /hc/{locale}/."
  );
}

// GET /api/v2/help_center/locales で有効ロケール一覧を取る。失敗時や空配列のときは null
async function fetchHelpCenterLocales(origin) {
  const url = `${origin}/api/v2/help_center/locales.json`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  const list = data.locales;
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  return list;
}

// 複数ロケールが有効ならすべて取得。locales API が使えないときは現在ページから1ロケールだけ
async function resolveLocalesForExport(origin) {
  const fromApi = await fetchHelpCenterLocales(origin);
  if (fromApi) {
    return fromApi;
  }
  return [detectLocale()];
}

// Zendesk Help Center API をページ送りで叩き、すべての記事オブジェクトを1つの配列にまとめる
async function fetchAllArticles(origin, locale) {
  let url = `${origin}/api/v2/help_center/${encodeURIComponent(locale)}/articles.json?page[size]=100&sort_by=updated_at&sort_order=asc`;

  const all = [];

  while (url) {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(
        chrome.i18n.getMessage("errorFetchArticles", [String(res.status)])
      );
    }

    const data = await res.json();
    all.push(...(data.articles || []));

    // API のリンクで次ページへ。has_more が false なら終了
    if (data.meta?.has_more && data.links?.next) {
      url = data.links.next;
    } else {
      url = null;
    }
  }

  return all;
}

// CSV の1セル用。カンマ・改行・ダブルクォートを含む場合は RFC 4180 に沿ってエスケープ
function escapeCsv(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// 記事配列を1つの CSV 文字列に変換（1行目は英語の列名ヘッダ）
function articlesToCsv(articles, origin) {
  const headers = [
    "id",
    "url",
    "html_url",
    "author_id",
    "comments_disabled",
    "draft",
    "promoted",
    "position",
    "vote_sum",
    "vote_count",
    "section_id",
    "created_at",
    "updated_at",
    "name",
    "title",
    "source_locale",
    "locale",
    "outdated",
    "outdated_locales",
    "edited_at",
    "user_segment_id",
    "permission_group_id",
    "content_tag_ids",
    "label_names",
    "body",
    "user_segment_ids"
  ];

  const rows = articles.map((article) => {
    const row = [
      article.id,
      article.url,
      article.html_url,
      article.author_id,
      article.comments_disabled,
      article.draft,
      article.promoted,
      article.position,
      article.vote_sum,
      article.vote_count,
      article.section_id,
      article.created_at,
      article.updated_at,
      article.name,
      article.title,
      article.source_locale,
      article.locale,
      article.outdated,
      article.outdated_locales,
      article.edited_at,
      article.user_segment_id,
      article.permission_group_id,
      article.content_tag_ids,
      article.label_names,
      article.body,
      article.user_segment_ids
    ];

    return row.map(escapeCsv).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

// UTF-8 BOM 付きで Blob を作り、見えない <a> のクリックでブラウザのダウンロードを起動（Excel で文字化けしにくくする）
function downloadCsv(csv, filename) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  // メモリ解放（少し遅延させてクリック処理が終わってから revoke）
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
