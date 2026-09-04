#!/usr/bin/env python3
import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode, parse_qsl, urlsplit, urlunsplit
from playwright.async_api import async_playwright


def parse_number(value):
    if value is None:
        return None
    value = value.strip().replace(',', '')
    try:
        if '.' in value:
            return float(value)
        return int(value)
    except ValueError:
        return value


async def scrape_leaderboard(url: str, output_path: str, wait_ms: int = 4000, max_pages: int = 9, page_delay_ms: int = 500):
    """
    Scrape a FortniteTracker leaderboard, following pagination if present.

    Behavior:
    - Scrape the initial URL (no page param)
    - Then attempt page=1, page=2, ... until a page returns zero rows or max_pages is reached
    - Combine all rows into a single output JSON
    """
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
            ],
        )
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            locale='en-US',
            viewport={'width': 1920, 'height': 1080},
            java_script_enabled=True,
            extra_http_headers={
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
        )

        await context.add_init_script(
            '''() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
                window.navigator.chrome = {
                    runtime: {},
                };
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) =>
                    parameters.name === 'notifications'
                        ? Promise.resolve({ state: Notification.permission })
                        : originalQuery(parameters);
            }'''
        )

        all_rows = []

        def write_payload(path: str, payload: dict, partial: bool = False):
            destination = f"{path}.partial" if partial else path
            temp_path = f"{destination}.tmp"
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp_path, destination)

        async def scrape_page(target_url: str):
            page = await context.new_page()
            await page.goto(target_url, wait_until='domcontentloaded', timeout=60000)
            await page.wait_for_timeout(wait_ms)

            try:
                await page.wait_for_selector('table tbody tr', timeout=15000)
            except Exception:
                pass

            rows = await page.evaluate(
                '''() => {
                    const table = document.querySelector('table tbody') || document.querySelector('table');
                    if (!table) {
                        return [];
                    }
                    const rowElements = Array.from(table.querySelectorAll('tr'));
                    const result = [];

                    rowElements.forEach((row) => {
                        const cells = Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || '');
                        if (cells.length < 2) {
                            return;
                        }

                        const rankText = cells[0] || '';
                        if (!rankText || rankText.toLowerCase().includes('rank')) {
                            return;
                        }

                        const playerText = cells[1] || '';
                        const parsed = {
                            rank: rankText,
                            player: playerText,
                            points: cells[2] || '',
                            matches: cells[3] || '',
                            wins: cells[4] || '',
                            avgElims: cells[5] || '',
                            avgPlace: cells[6] || ''
                        };
                        result.push(parsed);
                    });

                    return result;
                }'''
            )

            await page.close()
            return rows or []

        # Helper to build URL with page param
        def url_with_page(base: str, page_num: int):
            parsed = urlsplit(base)
            params = dict(parse_qsl(parsed.query, keep_blank_values=True))
            params['page'] = str(page_num)
            new_query = urlencode(params, doseq=True)
            return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))

        def strip_page_param(source_url: str):
            parsed = urlsplit(source_url)
            params = dict(parse_qsl(parsed.query, keep_blank_values=True))
            params.pop('page', None)
            new_query = urlencode(params, doseq=True)
            return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))

        base_url = strip_page_param(url)

        # Scrape up to max_pages + 1 pages, starting with page=0 as the first 100 rows.
        try:
            for page_num in range(0, max_pages + 1):
                await __import__('asyncio').sleep(page_delay_ms / 1000)
                current_url = base_url if page_num == 0 else url_with_page(base_url, page_num)
                rows = await scrape_page(current_url)
                if not rows:
                    break
                all_rows.extend(rows)

                payload = {
                    'url': url,
                    'scrapedAt': datetime.utcnow().isoformat() + 'Z',
                    'rowCount': len(all_rows),
                    'rows': [
                        {
                            'rank': r.get('rank', ''),
                            'player': r.get('player', ''),
                            'points': parse_number(r.get('points', '')),
                            'matches': parse_number(r.get('matches', '')),
                            'wins': parse_number(r.get('wins', '')),
                            'avgElims': parse_number(r.get('avgElims', '')),
                            'avgPlace': parse_number(r.get('avgPlace', '')),
                        }
                        for r in all_rows
                    ],
                }
                write_payload(output_path, payload, partial=True)
        finally:
            await browser.close()

        payload = {
            'url': url,
            'scrapedAt': datetime.utcnow().isoformat() + 'Z',
            'rowCount': len(all_rows),
            'rows': [
                {
                    'rank': r.get('rank', ''),
                    'player': r.get('player', ''),
                    'points': parse_number(r.get('points', '')),
                    'matches': parse_number(r.get('matches', '')),
                    'wins': parse_number(r.get('wins', '')),
                    'avgElims': parse_number(r.get('avgElims', '')),
                    'avgPlace': parse_number(r.get('avgPlace', '')),
                }
                for r in all_rows
            ],
        }

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

        partial_path = f"{output_path}.partial"
        if os.path.exists(partial_path):
            os.remove(partial_path)

        return payload


def main():
    parser = argparse.ArgumentParser(description='Scrape FortniteTracker leaderboard data to JSON.')
    parser.add_argument('--url', required=True, help='FortniteTracker leaderboard URL')
    parser.add_argument('--output', required=True, help='Path to save scraped leaderboard JSON')
    parser.add_argument('--wait-ms', type=int, default=4000, help='Delay in milliseconds after page load before scraping')
    parser.add_argument('--max-pages', type=int, default=9, help='Number of paginated pages to scrape after the first page')
    args = parser.parse_args()

    payload = __import__('asyncio').run(scrape_leaderboard(args.url, args.output, args.wait_ms, args.max_pages))
    print(json.dumps(payload))


if __name__ == '__main__':
    main()
