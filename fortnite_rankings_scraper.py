#!/usr/bin/env python3
"""
Fortnite Power Rankings Scraper - Top 10000+
Extrahiert alle Pro-Spieler von der Fortnite Power-Rankings Seite (EU)
Scrapet Seiten 1-100 und konsolidiert zu einer globalen Liste
"""

import argparse
import asyncio
import json
import os
import math
import sys
import subprocess
from playwright.async_api import async_playwright
from datetime import datetime
import tempfile
import time

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
    except Exception:
        pass

if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='backslashreplace')
    except Exception:
        pass

async def scrape_fortnite_rankings(region="EU", pages=5, page_size=50, start_page=1, end_page=None, source='fortnite', headless=True, upload_each_page=False):
    """
    General scraper that can target Fortnite power-rankings or eucompetitive ranking pages.

    Args:
        region: region string used for URL construction when applicable.
        pages: maximum number of pages to collect when end_page is not provided.
        page_size: number of entries per Fortnite page.
        start_page: first Fortnite page to scrape.
        end_page: last Fortnite page to scrape (inclusive).
        source: 'fortnite' or 'eucompetitive'
    """
    all_rankings = []
    failed_pages = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-gpu',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        )

        # Build start URL depending on source
        if source == 'eucompetitive':
            start_url = 'https://eucompetitive.com/ranking'
        else:
            start_url = f"https://www.fortnite.com/competitive/power-rankings?region={region}&pageSize={page_size}&page=1"

        # we will collect a set of page URLs to visit (respecting pages limit)
        page_urls = []

        try:
            if source != 'eucompetitive':
                start = max(1, start_page)
                if end_page is not None and end_page >= start:
                    page_urls = [
                        f"https://www.fortnite.com/competitive/power-rankings?region={region}&pageSize={page_size}&page={i}"
                        for i in range(start, end_page + 1)
                    ]
                else:
                    page_urls = [
                        f"https://www.fortnite.com/competitive/power-rankings?region={region}&pageSize={page_size}&page={i}"
                        for i in range(start, start + pages)
                    ]
            else:
                context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                page = await context.new_page()
                await page.goto(start_url, wait_until="domcontentloaded", timeout=90000)
                await page.wait_for_timeout(4000)

                # find pagination links (try common patterns)
                anchors = await page.evaluate("""
                    () => {
                        const urls = new Set();
                        // pagination containers
                        const pagContainers = Array.from(document.querySelectorAll('.pagination, nav, .pager, .pages'));
                        if (pagContainers.length > 0) {
                            pagContainers.forEach(pc => {
                                Array.from(pc.querySelectorAll('a')).forEach(a => { if (a.href) urls.add(a.href); });
                            });
                        }
                        // fallback: collect numeric page links anywhere
                        Array.from(document.querySelectorAll('a')).forEach(a => {
                            if (!a.href) return;
                            const t = (a.textContent||'').trim();
                            if (/^\d+$/.test(t) || /page=\d+/i.test(a.href)) urls.add(a.href);
                        });
                        return Array.from(urls);
                    }
                """)

                # include start_url first
                page_urls = [start_url]
                for u in anchors:
                    if len(page_urls) >= pages:
                        break
                    if u and u not in page_urls:
                        page_urls.append(u)

                await context.close()
        except Exception as e:
            print('Error while collecting pagination URLs:', e)

        # Visit each page URL and extract table rows
        for idx, url in enumerate(page_urls, 1):
            try:
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    viewport={ 'width': 1400, 'height': 900 },
                )
                page = await context.new_page()
                print(f"\n🌐 Fetching page {idx}/{min(len(page_urls), pages)}: {url}")
                await page.goto(url, wait_until='domcontentloaded', timeout=120000)
                try:
                    await page.wait_for_selector('table', timeout=120000)
                except Exception:
                    pass
                await page.wait_for_timeout(4000)

                # use same generic table extractor as before
                rankings_data = await page.evaluate("""
                    () => {
                        const normalizeHeader = (value) => {
                            const raw = (value || '').toString().trim().toUpperCase();
                            return raw.replace(/[^A-Z0-9]/g, '');
                        };

                        const parseScore = (value) => {
                            const raw = (value || '').toString().trim();
                            if (!raw) return 0;
                            const cleaned = raw.replace(/\s/g, '').replace(',', '.');
                            const parsed = Number(cleaned);
                            return Number.isFinite(parsed) ? parsed : 0;
                        };

                        const results = [];
                        const table = document.querySelector('table');
                        if (!table) return results;

                        let headers = [];
                        const thead = table.querySelector('thead');
                        if (thead) headers = Array.from(thead.querySelectorAll('th')).map(h => (h.textContent || '').trim());
                        else {
                            const firstRow = table.querySelector('tr');
                            if (firstRow) headers = Array.from(firstRow.querySelectorAll('th,td')).map(h => (h.textContent || '').trim());
                        }

                        const normalizedHeaders = headers.map(normalizeHeader);
                        const tbody = table.querySelector('tbody') || table;
                        const rows = Array.from(tbody.querySelectorAll('tr'));

                        rows.forEach(row => {
                            try {
                                const cells = Array.from(row.querySelectorAll('td,th'));
                                if (!cells || cells.length === 0) return;
                                const obj = {};

                                if (normalizedHeaders.length === cells.length) {
                                    normalizedHeaders.forEach((header, index) => {
                                        const value = (cells[index].textContent || '').trim();
                                        if (header.includes('PLAYER') || header.includes('SPIELER')) obj['PLAYER'] = value;
                                        if (header.includes('PRSCORE') || header.includes('PRWERTUNG') || header.includes('SCORE')) obj['PR SCORE'] = value;
                                        if (header.includes('PEAK') && header.includes('PR')) obj['PEAK PR'] = value;
                                        if (header.includes('DELTA') || header.includes('DPR')) obj['DELTA'] = value;
                                        if (header.includes('EVENT')) obj['EVENTS'] = value;
                                        if (header.includes('REGION')) obj['REGION'] = value;
                                    });
                                } else {
                                    if (cells.length >= 2) obj['PLAYER'] = (cells[1].textContent || '').trim();
                                    if (cells.length >= 3) obj['PR SCORE'] = (cells[2].textContent || '').trim();
                                    if (cells.length >= 4) obj['PEAK PR'] = (cells[3].textContent || '').trim();
                                    if (cells.length >= 5) obj['DELTA'] = (cells[4].textContent || '').trim();
                                    if (cells.length >= 6) obj['EVENTS'] = (cells[5].textContent || '').trim();
                                }

                                const nameCell = (obj['PLAYER'] || '').trim();
                                if (!nameCell) return;

                                let points = parseScore(obj['PR SCORE'] || obj['PRWERTUNG'] || obj['SCORE']);
                                // Fallback: if points parsed as 0, try scanning all cells for numeric-looking values (handles layout changes)
                                if ((!points || points === 0) && cells && cells.length > 0) {
                                    try {
                                        const rowText = cells.map(c => (c.textContent||'').trim()).join(' ');
                                        // match numbers with optional thousands separators like 1.299.131 or 1299.131 or 1299,131
                                        const numMatches = Array.from(rowText.matchAll(/[0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]+)?/g));
                                        const nums = numMatches.map(m => m[0].replace(/\./g, '').replace(',', '.'));
                                        const parsedNums = nums.map(n => Number(n)).filter(Number.isFinite);
                                        if (parsedNums.length > 0) {
                                            points = Math.max(...parsedNums);
                                        }
                                    } catch (e) {}
                                }
                                const peak = parseScore(obj['PEAK PR']);
                                const delta = obj['DELTA'] ? parseScore(obj['DELTA'].replace('+', '')) : null;
                                const eventsText = (obj['EVENTS'] || '').replace(/[^0-9]/g, '');
                                const events = eventsText ? parseInt(eventsText, 10) : null;

                                let region = '';
                                try {
                                    const playerCell = cells[1];
                                    const img = playerCell ? playerCell.querySelector('img') : null;
                                    if (img) {
                                        const src = img.src || img.getAttribute('src') || '';
                                        const m = src.match(/flag-([a-z]{2,6})/i);
                                        if (m) region = m[1].toUpperCase() === 'GLOBE' ? 'GL' : m[1].toUpperCase();
                                    }
                                } catch (e) {}

                                const entry = { name: nameCell, points: points, region: region || (obj['REGION'] || '').trim() };
                                if (peak !== null && peak !== 0) entry['peak_pr'] = peak;
                                if (delta !== null) entry['delta_pr'] = delta;
                                if (events !== null) entry['events'] = events;
                                results.push(entry);
                            } catch (e) {}
                        });
                        return results;
                    }
                """)

                if rankings_data and len(rankings_data) > 0:
                        # Append the page's entries, then write a single partial file for the page.
                        all_rankings.extend(rankings_data)
                        print(f"   ✅ {len(rankings_data)} Spieler | Gesamt: {len(all_rankings)}")

                        try:
                            partial = {
                                "extracted_at": datetime.now().isoformat(),
                                "player_count": len(all_rankings),
                                "region": region,
                                "source_pages": pages,
                                "last_page_processed": idx,
                                "rankings": all_rankings,
                            }

                            def write_json_atomic(target_path: str, data: dict, retries: int = 5, delay: float = 0.2) -> bool:
                                dirpath = os.path.dirname(os.path.abspath(target_path)) or os.getcwd()
                                for attempt in range(retries):
                                    tmpname = None
                                    try:
                                        fd, tmpname = tempfile.mkstemp(dir=dirpath, prefix=".tmp_rankings_", suffix=".json")
                                        with os.fdopen(fd, 'w', encoding='utf-8') as tf:
                                            json.dump(data, tf, indent=2, ensure_ascii=False)
                                        # atomic replace
                                        os.replace(tmpname, target_path)
                                        return True
                                    except PermissionError:
                                        try:
                                            if tmpname and os.path.exists(tmpname):
                                                os.remove(tmpname)
                                        except Exception:
                                            pass
                                        time.sleep(delay)
                                        continue
                                    except Exception:
                                        try:
                                            if tmpname and os.path.exists(tmpname):
                                                os.remove(tmpname)
                                        except Exception:
                                            pass
                                        time.sleep(delay)
                                        continue
                                return False

                            # write main file
                            ok_main = write_json_atomic(os.path.join(os.getcwd(), 'rankings_all_regions.json'), partial)
                            # write public copy
                            public_dir = os.path.join(os.getcwd(), 'public')
                            os.makedirs(public_dir, exist_ok=True)
                            public_path = os.path.join(public_dir, 'rankings_all_regions.json')
                            ok_public = write_json_atomic(public_path, partial)

                            if not ok_main:
                                print("   ⚠️ Fehler beim Schreiben der Zwischen-Datei: konnte main JSON nicht atomar schreiben")
                            if not ok_public:
                                print("   ⚠️ Fehler beim Schreiben der Zwischen-Datei: konnte public JSON nicht atomar schreiben")

                            # optional background upload per page
                            if upload_each_page and os.environ.get('SUPABASE_URL') and os.environ.get('SUPABASE_SERVICE_ROLE_KEY'):
                                try:
                                    subprocess.Popen([sys.executable, os.path.join(os.getcwd(), 'scripts', 'upload_to_supabase.py')], cwd=os.getcwd())
                                except Exception:
                                    pass
                        except Exception as e:
                            print("   ⚠️ Fehler beim Schreiben der Zwischen-Datei:", str(e)[:200])
                else:
                    failed_pages.append(url)
                    print("   ⚠️  Seite hatte keine Daten")

                await context.close()

            except Exception as e:
                failed_pages.append(url)
                print(f"   ❌ Fehler: {str(e)[:80]}")
                continue

        await browser.close()

    return all_rankings, failed_pages




async def main():
    """Hauptfunktion"""
    parser = argparse.ArgumentParser(description='Fortnite Power Rankings Scraper')
    parser.add_argument('--region', default='EU', help='Region to scrape, e.g. EU')
    parser.add_argument('--top', type=int, default=None, help='Fetch the top N players using pageSize to calculate pages')
    parser.add_argument('--pages', type=int, default=20, help='Number of pages to scrape (pages limit applied when --endPage is not provided)')
    parser.add_argument('--pageSize', type=int, default=50, help='Number of entries per Fortnite page')
    parser.add_argument('--startPage', type=int, default=1, help='First Fortnite page to scrape')
    parser.add_argument('--endPage', type=int, default=None, help='Last Fortnite page to scrape (inclusive)')
    parser.add_argument('--source', choices=['fortnite','eucompetitive'], default='fortnite', help='Source site to scrape')
    parser.add_argument('--headless', action=argparse.BooleanOptionalAction, default=True, help='Run browser in headless mode (default: on)')
    parser.add_argument('--upload-each-page', action='store_true', help='Attempt to upload partial results to Supabase after each page')
    args = parser.parse_args()

    effective_pages = args.pages
    if args.top is not None and args.top > 0:
        effective_pages = math.ceil(args.top / args.pageSize)

    print(
        "Rankings Scraper - Source=%s Region=%s Start=%s End=%s Pages=%s Top=%s" %
        (
            args.source,
            args.region,
            args.startPage,
            args.endPage if args.endPage is not None else 'auto',
            effective_pages,
            args.top if args.top is not None else 'all'
        )
    )
    print("=" * 60)
    
    rankings, failed_pages = await scrape_fortnite_rankings(
        region=args.region,
        pages=effective_pages,
        page_size=args.pageSize,
        start_page=args.startPage,
        end_page=args.endPage,
        source=args.source,
        headless=args.headless,
        upload_each_page=args.upload_each_page
    )
    
    if rankings and len(rankings) > 0:
        print(f"\n📊 Verarbeite {len(rankings)} Datensätze...")
        
        # Entferne Duplikate (behalte nur den mit höheren Punkten)
        seen = {}
        unique_rankings = []
        for player in rankings:
            name = player['name'].lower()
            if name not in seen or player['points'] > seen[name]['points']:
                if name in seen:
                    # Ersetze den alten Eintrag
                    unique_rankings = [p for p in unique_rankings if p['name'].lower() != name]
                unique_rankings.append(player)
                seen[name] = player
        
        # Sortiere nach Punkten (absteigend) um Top zu bekommen
        sorted_rankings = sorted(unique_rankings, key=lambda x: x['points'], reverse=True)
        
        # Nummeriere neu nach Punkten
        for idx, player in enumerate(sorted_rankings, 1):
            player['rank'] = idx
        
        data = {
            "extracted_at": datetime.now().isoformat(),
            "player_count": len(sorted_rankings),
            "region": args.region,
            "source_pages": args.pages,
            "rankings": sorted_rankings
        }
        
        # Speichere als JSON
        output_file = "rankings_all_regions.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ Datei gespeichert: {output_file}")
        print(f"📈 Insgesamt: {len(sorted_rankings)} eindeutige Spieler (EU Top 10.000)")
        print(f"⚠️  Fehlerhafte Seiten: {len(failed_pages)} von 100 ({failed_pages[:10] if failed_pages else 'keine'})")
        
        # Zeige Top 20
        print("\n🏆 Top 20 (EU):")
        for player in sorted_rankings[:20]:
            print(f"  {player['rank']:>5}. {player['name']:<30} {player['points']:>10} Punkte")
        
        # Zeige Bottom 10
        print("\n📉 Spieler 9991-10000:")
        for player in sorted_rankings[-10:]:
            print(f"  {player['rank']:>5}. {player['name']:<30} {player['points']:>10} Punkte")
    else:
        print("❌ Keine Rankings gefunden.")


if __name__ == "__main__":
    asyncio.run(main())

