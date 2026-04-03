# -*- coding: utf-8 -*-
"""
Zendesk Help Center の記事を API で一覧取得し、JSON または CSV に出力する CLI。

Chrome 拡張（extension/）と同じ Help Center API（locales / articles、カーソルページング）を利用する。
"""

import argparse
import csv
import json
import sys
from typing import Any, Dict, List, Optional, TextIO
from urllib.parse import quote, urlparse

import requests
from markdownify import markdownify as html_to_markdown

# Help Center article の CSV 列（Chrome 拡張の CSV と揃える。配列・オブジェクト列は JSON 文字列化する）
CSV_FIELDNAMES = (
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
    "user_segment_ids",
)


def csv_cell(value: Any) -> str:
    """CSV の1セル用。欠損・配列・オブジェクトを扱いやすい形にする。"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(value, ensure_ascii=False)


def body_html_to_markdown(html: Any) -> str:
    """記事 body（HTML）を Markdown に変換する。空・非文字列は空文字。"""
    if not html or not isinstance(html, str):
        return ""
    return html_to_markdown(html, heading_style="ATX").strip()


def locale_code_from_entry(entry: Any) -> str:
    """locales API の1要素からロケールコード文字列を取り出す（文字列 or {locale: ...} 両対応）。"""
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict) and isinstance(entry.get("locale"), str):
        return entry["locale"]
    return ""


def normalize_base_url(url: str) -> str:
    """ベース URL を scheme + netloc の形に揃える。https 省略時は付与する。"""
    u = url.strip().rstrip("/")
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    parsed = urlparse(u)
    if not parsed.netloc:
        raise SystemExit(f"Invalid base URL: {url!r}")
    return f"{parsed.scheme}://{parsed.netloc}"


def build_session(email: Optional[str], token: Optional[str]) -> requests.Session:
    """HTTP セッションを作る。email/token 両方あるときだけ Zendesk 標準の Basic 認証を付与。"""
    s = requests.Session()
    s.headers["Accept"] = "application/json"
    s.headers["User-Agent"] = "HelpCenterArticlesExporterforZendesk/1.0 (python list_articles)"
    if email is not None and token is not None:
        # Zendesk: ユーザー名に「メール/token」、パスワードに API トークン
        s.auth = (f"{email}/token", token)
    return s


def fetch_locale_codes(session: requests.Session, origin: str) -> Optional[List[str]]:
    """GET locales.json から有効ロケールのコード一覧を返す。失敗・空なら None。"""
    url = f"{origin}/api/v2/help_center/locales.json"
    r = session.get(url, timeout=60)
    if not r.ok:
        return None
    data = r.json()
    locales = data.get("locales")
    if not isinstance(locales, list) or len(locales) == 0:
        return None
    codes = [locale_code_from_entry(x) for x in locales]
    return [c for c in codes if c]


def fetch_all_articles(
    session: requests.Session, origin: str, locale: str
) -> List[Dict[str, Any]]:
    """指定ロケールの記事を、meta.has_more と links.next が尽きるまで取得して結合する。"""
    loc = quote(locale, safe="")
    url = (
        f"{origin}/api/v2/help_center/{loc}/articles.json"
        "?page[size]=100&sort_by=updated_at&sort_order=asc"
    )
    out: List[Dict[str, Any]] = []

    while url:
        r = session.get(url, timeout=120)
        if not r.ok:
            raise RuntimeError(
                f"Failed to fetch articles ({r.status_code}): {r.text[:500]}"
            )
        data = r.json()
        batch = data.get("articles") or []
        if not isinstance(batch, list):
            batch = []
        out.extend(batch)

        meta = data.get("meta") or {}
        links = data.get("links") or {}
        if meta.get("has_more") and links.get("next"):
            url = str(links["next"])
        else:
            url = None

    return out


def write_json(
    rows: List[Dict[str, Any]], out: TextIO, *, utf8_bom: bool = False
) -> None:
    """記事オブジェクトの配列を JSON で書き出す。ファイル出力時のみ UTF-8 BOM を付ける（Excel 等向け）。"""
    if utf8_bom:
        out.write("\ufeff")
    json.dump(rows, out, ensure_ascii=False, indent=2)
    out.write("\n")


def write_csv(rows: List[Dict[str, Any]], out: TextIO, *, utf8_bom: bool = True) -> None:
    """1 記事 1 行。CSV_FIELDNAMES の列順で出力する（body_markdown は body から生成）。"""
    if utf8_bom:
        out.write("\ufeff")
    w = csv.DictWriter(out, fieldnames=list(CSV_FIELDNAMES), extrasaction="ignore")
    w.writeheader()
    for row in rows:
        cells: Dict[str, str] = {}
        for k in CSV_FIELDNAMES:
            if k == "body_markdown":
                cells[k] = body_html_to_markdown(row.get("body"))
            else:
                cells[k] = csv_cell(row.get(k))
        w.writerow(cells)


def parse_args() -> argparse.Namespace:
    """コマンドライン引数を解析する。"""
    p = argparse.ArgumentParser(
        description="List Zendesk Help Center articles (cursor-paginated, all enabled locales unless --locale)."
    )
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument(
        "--base-url",
        help="Help Center origin, e.g. https://yourdomain.zendesk.com",
    )
    g.add_argument(
        "--subdomain",
        help="Zendesk subdomain only (https://{subdomain}.zendesk.com)",
    )
    p.add_argument(
        "--email",
        default=None,
        help="Zendesk account email (use with --token for private articles)",
    )
    p.add_argument(
        "--token",
        default=None,
        help="Zendesk API token (use with --email)",
    )
    p.add_argument(
        "--locale",
        default=None,
        help="Only this Help Center locale (skip locales API), e.g. ja",
    )
    p.add_argument(
        "--output",
        "-o",
        default=None,
        help="Write to this file instead of stdout",
    )
    p.add_argument(
        "--format",
        choices=("json", "csv"),
        default="json",
        help="Output format (default: json)",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    # 認証はペア指定のみ（片方だけは誤用防止のため拒否）
    if (args.email is None) ^ (args.token is None):
        raise SystemExit("--email and --token must be given together or omitted.")

    if args.subdomain:
        sub = args.subdomain.strip()
        if sub.endswith(".zendesk.com"):
            sub = sub[: -len(".zendesk.com")]
        origin = normalize_base_url(f"https://{sub}.zendesk.com")
    else:
        origin = normalize_base_url(args.base_url)

    session = build_session(args.email, args.token)

    if args.locale:
        locale_codes = [args.locale.strip()]
    else:
        locale_codes = fetch_locale_codes(session, origin)
        if not locale_codes:
            raise SystemExit(
                "Could not load locales from the Help Center API. "
                "Try again with --locale (e.g. --locale ja)."
            )

    all_articles: List[Dict[str, Any]] = []
    for loc in locale_codes:
        try:
            batch = fetch_all_articles(session, origin, loc)
        except RuntimeError as e:
            raise SystemExit(str(e)) from e
        for a in batch:
            if not isinstance(a, dict):
                continue
            all_articles.append(a)

    out = open(args.output, "w", encoding="utf-8", newline="") if args.output else sys.stdout
    close_out = args.output is not None
    try:
        if args.format == "json":
            write_json(all_articles, out, utf8_bom=bool(args.output))
        else:
            write_csv(all_articles, out, utf8_bom=True)
    finally:
        if close_out:
            out.close()


if __name__ == "__main__":
    main()
