chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXPORT_ZENDESK_ARTICLES") {
    exportArticles()
      .then((count) => sendResponse({ ok: true, count }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function exportArticles() {
  const origin = location.origin;
  const locale = detectLocale();

  const articles = await fetchAllArticles(origin, locale);

  const csv = articlesToCsv(articles, origin);
  const filename = `zendesk_articles_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;

  downloadCsv(csv, filename);

  return articles.length;
}

function detectLocale() {
  const match = location.pathname.match(/^\/hc\/([^/]+)/);
  if (match?.[1]) return match[1];

  const htmlLang = document.documentElement.lang?.trim();
  if (htmlLang) return htmlLang;

  return "ja";
}

async function fetchAllArticles(origin, locale) {
  let url = `${origin}/api/v2/help_center/${encodeURIComponent(locale)}/articles.json?page[size]=100&sort_by=updated_at&sort_order=asc`;

  const all = [];

  while (url) {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include", // ← ここが重要
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(`記事取得に失敗しました: ${res.status}`);
    }

    const data = await res.json();
    all.push(...(data.articles || []));

    if (data.meta?.has_more && data.links?.next) {
      url = data.links.next;
    } else {
      url = null;
    }
  }

  return all;
}

function stripHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function buildArticleUrl(article, origin) {
  if (article.html_url) return article.html_url;
  if (article.locale && article.id) {
    return `${origin}/hc/${article.locale}/articles/${article.id}`;
  }
  return "";
}

function escapeCsv(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function articlesToCsv(articles, origin) {
  const headers = [
    "id",
    "title",
    "locale",
    "draft",
    "outdated",
    "promoted",
    "position",
    "vote_sum",
    "vote_count",
    "section_id",
    "category_id",
    "author_id",
    "created_at",
    "updated_at",
    "label_names",
    "html_url",
    "body_text"
  ];

  const rows = articles.map((article) => {
    const row = [
      article.id,
      article.title,
      article.locale,
      article.draft,
      article.outdated,
      article.promoted,
      article.position,
      article.vote_sum,
      article.vote_count,
      article.section_id,
      article.category_id,
      article.author_id,
      article.created_at,
      article.updated_at,
      Array.isArray(article.label_names) ? article.label_names.join("|") : "",
      buildArticleUrl(article, origin),
      stripHtml(article.body)
    ];

    return row.map(escapeCsv).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function downloadCsv(csv, filename) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}