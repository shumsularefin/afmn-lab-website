#!/usr/bin/env python3
"""Refresh the website from Prof. Md. Kamruzzaman's Google Scholar profile.

Run by .github/workflows/scholar-update.yml on the 1st and 15th of each month.
It updates, in place:

  public/js/scholar.js   citation totals, h-index, i10-index and the check date
  public/js/data.js      citation counts of listed papers; new papers are added
                         to PUBS and announced in NEWS
  public/*.html          the no-JavaScript fallback numbers and cache-busting
                         ?v= stamps of the two data scripts

Nothing is written if Scholar cannot be read or the result looks implausible,
so a blocked or broken fetch never damages the site.

Usage:
  python scripts/update_scholar.py               fetch the live profile
  python scripts/update_scholar.py --html F.html read a profile page saved from a
                                                 browser (manual fallback/testing)
  python scripts/update_scholar.py --dry-run     report changes without writing

Set SERPAPI_KEY to use SerpApi (serpapi.com) when Scholar blocks the direct request.
"""
import argparse
import datetime as dt
import difflib
import html
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SCHOLAR_USER = 'q-C5scUAAAAJ'
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
DATA_JS = PUBLIC / 'js' / 'data.js'
SCHOLAR_JS = PUBLIC / 'js' / 'scholar.js'
STATE = ROOT / 'scripts' / 'scholar-state.json'

BROWSER_UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')
BOT_UA = 'afmn-lab-website/1.0 (https://github.com/shumsularefin/afmn-lab-website)'
METRIC_KEYS = ('citations', 'citationsSince', 'sinceYear', 'hIndex', 'i10Index')


class FetchError(Exception):
    pass


# ---------- Fetching ----------

def parse_profile_html(page):
    """Return (metrics, articles) from a Scholar profile page."""
    soup = BeautifulSoup(page, 'html.parser')
    cells = [td.get_text(strip=True) for td in soup.select('#gsc_rsb_st td.gsc_rsb_std')]
    if len(cells) < 6:
        raise FetchError('no citation table on the page (blocked or CAPTCHA?)')
    since = re.search(r'(\d{4})', soup.select('#gsc_rsb_st th')[-1].get_text())
    metrics = {'citations': int(cells[0]), 'citationsSince': int(cells[1]),
               'sinceYear': int(since.group(1)) if since else dt.date.today().year - 5,
               'hIndex': int(cells[2]), 'i10Index': int(cells[4])}
    articles = []
    for row in soup.select('tr.gsc_a_tr'):
        link = row.select_one('a.gsc_a_at')
        if not link:
            continue
        gray = row.select('div.gs_gray')
        for extra in row.select('.gs_oph'):
            extra.decompose()
        cites = row.select_one('.gsc_a_ac').get_text(strip=True) if row.select_one('.gsc_a_ac') else ''
        year = row.select_one('.gsc_a_y').get_text(strip=True) if row.select_one('.gsc_a_y') else ''
        cid = re.search(r'citation_for_view=([\w:-]+)', link.get('href', '') + ' ' + link.get('data-href', ''))
        articles.append({
            'id': cid.group(1) if cid else link.get_text(strip=True),
            'title': link.get_text(strip=True),
            'authors': gray[0].get_text(strip=True) if gray else '',
            'venue': gray[1].get_text(strip=True) if len(gray) > 1 else '',
            'year': int(year) if year.isdigit() else None,
            'cites': int(cites) if cites.isdigit() else 0,
        })
    return metrics, articles


def fetch_direct():
    session = requests.Session()
    session.headers.update({'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9'})
    metrics, articles = None, []
    for start in range(0, 1000, 100):
        url = (f'https://scholar.google.com/citations?user={SCHOLAR_USER}&hl=en'
               f'&cstart={start}&pagesize=100&sortby=pubdate')
        for attempt in range(3):
            try:
                r = session.get(url, timeout=30)
                if r.status_code == 200:
                    break
            except requests.RequestException:
                pass
            time.sleep(10 * (attempt + 1))
        else:
            raise FetchError(f'Scholar did not answer {url}')
        m, page = parse_profile_html(r.text)
        metrics = metrics or m
        articles += page
        if len(page) < 100:
            return metrics, articles
        time.sleep(5)
    return metrics, articles


def fetch_serpapi(key):
    metrics, articles = None, []
    for start in range(0, 1000, 100):
        r = requests.get('https://serpapi.com/search.json', timeout=60, params={
            'engine': 'google_scholar_author', 'author_id': SCHOLAR_USER, 'hl': 'en',
            'sort': 'pubdate', 'num': 100, 'start': start, 'api_key': key})
        data = r.json()
        if r.status_code != 200 or 'error' in data:
            raise FetchError(f"SerpApi: {data.get('error', r.status_code)}")
        if metrics is None:
            table = {k: v for row in data['cited_by']['table'] for k, v in row.items()}
            since_key = next(k for k in table['citations'] if k.startswith('since_'))
            metrics = {'citations': table['citations']['all'], 'citationsSince': table['citations'][since_key],
                       'sinceYear': int(since_key.split('_')[1]),
                       'hIndex': table['h_index']['all'], 'i10Index': table['i10_index']['all']}
        page = data.get('articles', [])
        for a in page:
            year = str(a.get('year', ''))
            articles.append({'id': a.get('citation_id') or a['title'], 'title': a['title'],
                             'authors': a.get('authors', ''), 'venue': a.get('publication', ''),
                             'year': int(year) if year.isdigit() else None,
                             'cites': (a.get('cited_by') or {}).get('value') or 0})
        if len(page) < 100:
            return metrics, articles
    return metrics, articles


def fetch():
    errors = []
    try:
        return fetch_direct(), 'Google Scholar'
    except (FetchError, requests.RequestException) as e:
        errors.append(f'direct: {e}')
    key = os.environ.get('SERPAPI_KEY')
    if key:
        try:
            return fetch_serpapi(key), 'SerpApi'
        except (FetchError, requests.RequestException, KeyError, StopIteration) as e:
            errors.append(f'serpapi: {e}')
    else:
        errors.append('serpapi: SERPAPI_KEY not set')
    raise FetchError('; '.join(errors))


# ---------- Formatting new entries ----------

SMALL_WORDS = {'a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'de', 'und'}


def norm(title):
    t = unicodedata.normalize('NFKC', html.unescape(title)).lower()
    return re.sub(r'[^a-z0-9]+', '', t)


def initials_name(given, family):
    parts = [p for p in re.split(r'[\s.\-]+', given or '') if p]
    return (''.join(p[0].upper() + '.' for p in parts) + ' ' + family).strip()


def scholar_author(name):
    # Scholar writes "MH Munshi"; the site writes "M.H. Munshi".
    bits = name.split()
    if len(bits) > 1 and bits[0].isupper() and len(bits[0]) <= 4:
        return ''.join(c + '.' for c in bits[0]) + ' ' + ' '.join(bits[1:])
    return name


def author_list(names, truncated=False):
    shown = names[:6]
    pi = next((n for n in names[6:] if 'Kamruzzaman' in n), None)
    if pi:
        shown.append(pi)
    if truncated or len(names) > len(shown):
        shown.append('et al.')
    return ', '.join(shown)


def title_case_venue(venue):
    m = re.match(r'^(.*?)(\s+\d.*)?$', venue)
    name, rest = m.group(1), m.group(2) or ''
    words = [w if (w.isupper() or (i and w.lower() in SMALL_WORDS)) else w[:1].upper() + w[1:]
             for i, w in enumerate(name.split())]
    rest = re.sub(r'(\d)-(\d)', '\\1–\\2', re.sub(r'\s+\(', '(', rest))
    return ' '.join(words) + rest


def crossref(title):
    """Best Crossref match for a title, or None. Used only to enrich new papers."""
    try:
        r = requests.get('https://api.crossref.org/works', timeout=30, headers={'User-Agent': BOT_UA},
                         params={'query.bibliographic': title, 'rows': 3})
        items = r.json()['message']['items']
    except (requests.RequestException, ValueError, KeyError):
        return None
    for it in items:
        cand = (it.get('title') or [''])[0]
        if difflib.SequenceMatcher(None, norm(cand), norm(title)).ratio() >= 0.93:
            return it
    return None


def new_entry(article):
    """Build a PUBS row [year, type, cites, title, authors, venue, url] for a Scholar article."""
    title, year = article['title'], article['year']
    review = 'review' in title.lower()
    venue_l = article['venue'].lower()
    kind = ('a' if re.search(r'conference|meeting|symposium|congress|proceedings', venue_l) else
            'c' if re.search(r'\bbook\b|chapter|handbook', venue_l) else 'r' if review else 'j')
    authors = author_list([scholar_author(a.strip()) for a in article['authors'].split(',')
                           if a.strip() and a.strip() != '...'], '...' in article['authors'])
    venue, url = title_case_venue(article['venue']), ''
    cr = crossref(title)
    if cr:
        url = 'https://doi.org/' + cr['DOI']
        kind = {'book-chapter': 'c', 'proceedings-article': 'a'}.get(cr.get('type'), 'r' if review else 'j')
        names = [initials_name(a.get('given'), a['family']) for a in cr.get('author', []) if a.get('family')]
        if names:
            authors = author_list(names)
        journal = (cr.get('container-title') or [''])[0]
        if journal:
            vol, issue = cr.get('volume'), cr.get('issue')
            pages = (cr.get('page') or cr.get('article-number') or '').replace('-', '–')
            venue = journal + (f' {vol}' if vol else '') + (f'({issue})' if vol and issue else '') + \
                (f', {pages}' if pages else '')
    return [year, kind, article['cites'], title, authors, venue, url]


# ---------- Reading and writing the site ----------

JS_STR = r"'((?:[^'\\]|\\.)*)'"
PUB_LINE = re.compile(r"^(\s*\[)(\d{4}),'(\w)',(\d+),(" + JS_STR + r")")


def js_str(s):
    return "'" + str(s).replace('\\', '\\\\').replace("'", "\\'").replace('\n', ' ') + "'"


def js_unescape(s):
    return re.sub(r'\\(.)', r'\1', s)


def read_pubs(lines):
    """Index of PUBS rows in data.js: {line_no: (year, type, cites, title)}."""
    start = lines.index('const PUBS = [\n')
    pubs = {}
    for i in range(start + 1, len(lines)):
        if lines[i].startswith('];'):
            break
        m = PUB_LINE.match(lines[i])
        if m:
            pubs[i] = (int(m.group(2)), m.group(3), int(m.group(4)), js_unescape(m.group(6)))
    return start, pubs


def match_pub(article, pubs, by_norm):
    key = norm(article['title'])
    if key in by_norm:
        return by_norm[key]
    best, score = None, 0.0
    for i, (year, _, _, title) in pubs.items():
        if article['year'] and abs(year - article['year']) > 1:
            continue
        s = difflib.SequenceMatcher(None, norm(title), key).ratio()
        if s > score:
            best, score = i, s
    return best if score >= 0.9 else None


def write_scholar_js(metrics, updated):
    data = {'updated': updated, **{k: metrics[k] for k in METRIC_KEYS}}
    SCHOLAR_JS.write_text(
        '// Google Scholar metrics for Prof. Md. Kamruzzaman. Written by scripts/update_scholar.py,\n'
        '// which .github/workflows/scholar-update.yml runs on the 1st and 15th of each month.\n'
        f'const SCHOLAR = {json.dumps(data, separators=(", ", ": "))};\n')


def read_scholar_js():
    try:
        return json.loads(re.search(r'const SCHOLAR = (\{.*\});', SCHOLAR_JS.read_text()).group(1))
    except (OSError, AttributeError, ValueError):
        return {}


def month_label(iso):
    return dt.date.fromisoformat(iso).strftime('%B %Y')


def refresh_html(metrics, updated, stamp):
    """Keep the static fallback text and script cache-busters in step with scholar.js."""
    values = {k: f'{metrics[k]:,}' if k != 'sinceYear' else str(metrics[k]) for k in METRIC_KEYS}
    values['updated'] = month_label(updated)
    tag = re.compile(r'(<(\w+)[^>]*\bdata-scholar="(\w+)"[^>]*>)[^<]*(</\2>)')
    for page in PUBLIC.glob('*.html'):
        text = page.read_text()
        new = tag.sub(lambda m: m.group(1) + values.get(m.group(3), '') + m.group(4)
                      if m.group(3) in values else m.group(0), text)
        new = re.sub(r'(js/(?:data|scholar)\.js\?v=)[\w.-]+', r'\g<1>' + stamp, new)
        if new != text:
            page.write_text(new)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--html', nargs='+', help='saved Scholar profile page(s) to read instead of fetching')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    if args.html:
        metrics, articles, source = None, [], 'saved page'
        for f in args.html:
            try:
                m, a = parse_profile_html(Path(f).read_text(encoding='utf-8'))
            except FetchError as e:
                sys.exit(f'{f}: {e}; site left unchanged.')
            metrics, articles = metrics or m, articles + a
    else:
        try:
            (metrics, articles), source = fetch()
        except FetchError as e:
            sys.exit(f'Could not read Google Scholar, site left unchanged: {e}')

    previous = read_scholar_js()
    if not articles:
        sys.exit('Scholar returned no publications; site left unchanged.')
    if previous.get('citations') and metrics['citations'] < 0.8 * previous['citations']:
        sys.exit(f"Citations fell from {previous['citations']} to {metrics['citations']}; "
                 'this looks like a bad read, site left unchanged.')

    lines = DATA_JS.read_text().splitlines(keepends=True)
    pubs_start, pubs = read_pubs(lines)
    by_norm = {norm(t): i for i, (_, _, _, t) in pubs.items()}
    state = json.loads(STATE.read_text()) if STATE.exists() else None
    known = set(state['known']) if state else set()
    newest_listed = max(y for y, *_ in pubs.values())
    report, added, skipped = [], [], []

    seen = set()
    for a in articles:
        if a['id'] in seen:
            continue
        seen.add(a['id'])
        i = match_pub(a, pubs, by_norm)
        if i is not None:
            year, kind, cites, title = pubs[i]
            if a['cites'] != cites:
                m = PUB_LINE.match(lines[i])
                lines[i] = lines[i][:m.start(4)] + str(a['cites']) + lines[i][m.end(4):]
                report.append(f'- Citations {cites} → {a["cites"]}: {title}')
            known.add(a['id'])
            continue
        if a['id'] in known:
            continue
        known.add(a['id'])
        # First run: Scholar may hold older items the site deliberately leaves out, so only
        # take papers at least as recent as the newest one already listed.
        if not a['year'] or (state is None and a['year'] < newest_listed):
            skipped.append(a)
            continue
        added.append(new_entry(a))

    month = dt.date.today().strftime('%B %Y')
    if added:
        rows = [f"  [{y},'{k}',{c},{js_str(t)},{js_str(au)},{js_str(v)}{',' + js_str(u) if u else ''}],\n"
                for y, k, c, t, au, v, u in sorted(added, key=lambda e: -e[0])]
        lines[pubs_start + 1:pubs_start + 1] = rows
        news_start = lines.index('const NEWS = [\n')
        tags = {'j': 'Paper', 'r': 'Review', 'c': 'Chapter', 'a': 'Conference'}
        def news(title, venue):
            journal = re.sub(r'\s+\d.*$', '', venue.split(',')[0])
            text = html.escape(title, quote=False)
            return text + (f' published in <em>{html.escape(journal, quote=False)}</em>.' if journal else '.')
        lines[news_start + 1:news_start + 1] = [f"  [{js_str(month)}, '{tags[k]}', {js_str(news(t, v))}],\n"
                                                for _, k, _, t, _, v, _ in added]
        report += [f'- New {tags[k].lower()}: {t} ({v}, {y})' for y, k, _, t, _, v, _ in added]

    changed_metrics = {k: (previous.get(k), metrics[k]) for k in METRIC_KEYS if previous.get(k) != metrics[k]}
    report = [f'- {k}: {old} → {new}' for k, (old, new) in changed_metrics.items()] + report
    today = dt.date.today().isoformat()
    month_changed = not previous.get('updated') or month_label(previous['updated']) != month_label(today)
    data_changed = bool(report)

    print(f'Read {len(articles)} publications from {source}.')
    print('\n'.join(report) if report else 'No new citations or publications.')
    if skipped:
        print(f'Not added ({len(skipped)} older or undated Scholar items absent from the site):')
        print('\n'.join(f"  - {a['title']} ({a['year']})" for a in skipped))
    if args.dry_run:
        return

    if data_changed or month_changed:
        updated = today
        DATA_JS.write_text(''.join(lines))
        write_scholar_js(metrics, updated)
        refresh_html(metrics, updated, today.replace('-', ''))
    STATE.write_text(json.dumps({'known': sorted(known)}, indent=1) + '\n')

    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as f:
            f.write(f'### Google Scholar update ({source})\n\n' + ('\n'.join(report) or 'No changes.') + '\n')
            if skipped:
                f.write('\nOlder Scholar items not added to the site:\n' +
                        '\n'.join(f"- {a['title']} ({a['year']})" for a in skipped) + '\n')


if __name__ == '__main__':
    main()
