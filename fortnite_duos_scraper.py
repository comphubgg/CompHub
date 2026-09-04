#!/usr/bin/env python3
"""
Simple Playwright-based scraper to extract top N duos from Fortnitetracker event pages.
Writes output to data/duos.json
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# If new divisions/seasons appear, discover the latest event URLs on Fortnitetracker
TARGET_REGIONS = ['EU', 'NAC', 'ME', 'NAW', 'ASIA']

def discover_latest_event_urls(page):
    """Navigate to the events listing and pick the latest Season event per target region.
    We look for links like /events/epicgames_S41_FNCSDivisionalCup_Division1_EU
    and pick the highest S number per region.
    """
    base = 'https://fortnitetracker.com'
    page.goto('https://fortnitetracker.com/events?platform=pc', timeout=30000)
    page.wait_for_load_state('networkidle', timeout=30000)
    anchors = page.query_selector_all('a')
    import re
    pattern = re.compile(r'/events/(epicgames_S(\d+)_FNCSDivisionalCup_Division1_([A-Z]+))', re.IGNORECASE)
    best: dict = {}
    for a in anchors:
        try:
            href = a.get_attribute('href') or ''
            m = pattern.search(href)
            if not m:
                continue
            key = m.group(1)
            season = int(m.group(2))
            region = m.group(3).upper()
            if region not in TARGET_REGIONS:
                continue
            prev = best.get(region)
            if not prev or season > prev[0]:
                best[region] = (season, base + '/events/' + key)
        except Exception:
            continue

    # return urls for available regions
    return [v[1] for k, v in best.items()]

OUT_PATH = Path('data') / 'duos.json'
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

def parse_duos_from_event(page):
    # Fortnitetracker renders a table of placements; adapt selectors if layout changes
    rows = page.query_selector_all('table tr')
    duos = []
    for r in rows:
        try:
            cols = r.query_selector_all('td')
            if len(cols) < 3:
                continue
            place_text = cols[0].inner_text().strip()
            # player column may contain duo names separated
            players_text = cols[1].inner_text().strip()
            # points or score in later column
            score_text = cols[-1].inner_text().strip()

            if not players_text:
                continue

            # attempt to split duo names by newline or '/'
            parts = [p.strip() for p in players_text.replace('\u00a0',' ').split('\n') if p.strip()]
            if len(parts) < 2:
                # try split by /
                parts = [p.strip() for p in players_text.split('/') if p.strip()]

            if len(parts) >= 2:
                name1 = parts[0]
                name2 = parts[1]
                duos.append({
                    'player1': name1,
                    'player2': name2,
                    'placement': place_text,
                    'score': score_text
                })
        except Exception:
            continue
    return duos


def scrape(urls, top_n=100):
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # if caller passed no urls, discover latest events automatically
        if not urls:
            try:
                urls = discover_latest_event_urls(page)
            except Exception as e:
                print(f"Error discovering events: {e}", file=sys.stderr)
                urls = []

        for url in urls:
            try:
                page.goto(url, timeout=30000)
                page.wait_for_load_state('networkidle', timeout=30000)
                duos = parse_duos_from_event(page)
                # keep only top N
                results.extend(duos[:top_n])
            except Exception as e:
                print(f"Error scraping {url}: {e}", file=sys.stderr)
        browser.close()

    # normalize duo ids (sorted lowercased names)
    normalized = {}
    for d in results:
        a = d['player1'].lower()
        b = d['player2'].lower()
        key = '::'.join(sorted([a,b]))
        if key not in normalized:
            normalized[key] = {
                'id': f"duo-{key.replace(' ', '-')}",
                'player1': d['player1'],
                'player2': d['player2'],
                'score': d.get('score'),
                'placement': d.get('placement'),
            }

    out = list(normalized.values())
    OUT_PATH.write_text(json.dumps({'extracted_at': __import__('time').time(), 'duos': out}, indent=2), encoding='utf-8')
    print(f"Wrote {len(out)} duos to {OUT_PATH}")


if __name__ == '__main__':
    scrape(URLS)
