// ポップアップからのポート接続：API ページ取得ごとに進捗を送れる
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "zendesk-export") return;

  port.onMessage.addListener((msg) => {
    if (msg.type !== "EXPORT_ZENDESK_ARTICLES") return;

    (async () => {
      try {
        const format = msg.format === "markdown" ? "markdown" : "csv";
        const result = await exportArticles(format, (count) => {
          try {
            port.postMessage({ type: "progress", count });
          } catch {
            /* ポートが閉じている */
          }
        });

        if (typeof result === "number") {
          port.postMessage({ type: "done", ok: true, count: result });
        } else {
          port.postMessage({
            type: "done",
            ok: true,
            count: result.count,
            fileCount: result.fileCount
          });
        }
      } catch (error) {
        port.postMessage({ type: "done", ok: false, error: error.message });
      }
    })();
  });
});

function localeCodeFromEntry(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry.locale === "string") return entry.locale;
  return "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 現在のサイトから Help Center API で全記事を取得し、CSV または Markdown をダウンロードする
// onProgress は Help Center articles API を1ページ取得するたびに、これまでに取得した記事の累計件数で呼ばれる
async function exportArticles(format, onProgress) {
  const origin = location.origin;

  const localeEntries = await resolveLocalesForExport(origin);
  const localeCodes = localeEntries
    .map(localeCodeFromEntry)
    .filter(Boolean);

  let fetchedTotal = 0;
  const articles = [];
  for (const locale of localeCodes) {
    articles.push(
      ...(await fetchAllArticles(
        origin,
        locale,
        onProgress &&
          ((pageSize) => {
            fetchedTotal += pageSize;
            onProgress(fetchedTotal);
          })
      ))
    );
  }

  if (format === "markdown") {
    return exportArticlesMarkdown(articles, localeCodes);
  }

  const csv = articlesToCsv(articles, origin);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const originSlug = new URL(origin).hostname.replace(/[./\\?%*:|"<>]/g, "_");
  const filename = `${originSlug}_${stamp}.csv`;
  downloadCsv(csv, filename);

  return articles.length;
}

async function exportArticlesMarkdown(articles, localeCodes) {
  const turndownService = new TurndownService();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  let fileCount = 0;

  for (const locale of localeCodes) {
    const subset = articles.filter((a) => a.locale === locale);
    if (subset.length === 0) continue;

    const parts = subset.map((article) => {
      const title = String(article.title ?? "").replace(/\r?\n/g, " ");
      const bodyMd = turndownService.turndown(article.body ?? "");
      return `# ${title}\n\n${bodyMd}`;
    });
    const md = parts.join("\n\n---\n\n");
    const safeLocale = locale.replace(/[/\\?%*:|"<>]/g, "_");
    const filename = `zendesk_articles_${safeLocale}_${stamp}.md`;
    downloadText(md, filename, "text/markdown;charset=utf-8");
    fileCount++;
    await delay(50);
  }

  return { count: articles.length, fileCount };
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
// onPageFetched: 各レスポンスで取り込んだ記事数（通常最大100）を渡す
async function fetchAllArticles(origin, locale, onPageFetched) {
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
    const batch = data.articles || [];
    all.push(...batch);
    if (onPageFetched) {
      onPageFetched(batch.length);
    }

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
  const turndownService = new TurndownService();

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
    "body_markdown",
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
      turndownService.turndown(article.body ?? ""),
      article.user_segment_ids
    ];

    return row.map(escapeCsv).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// UTF-8 BOM 付きで CSV をダウンロード（Excel で文字化けしにくくする）
function downloadCsv(csv, filename) {
  const bom = "\uFEFF";
  downloadBlob(new Blob([bom + csv], { type: "text/csv;charset=utf-8;" }), filename);
}

function downloadText(text, filename, mimeType) {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}
