#!/usr/bin/env python3
"""
Test-Scraper: Prüfe ob Regionen extrahiert werden
"""

import asyncio
import json
from playwright.async_api import async_playwright

async def test_scrape():
    all_rankings = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        for page_num in range(1, 4):  # Nur 3 Seiten testen
            try:
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                )
                page = await context.new_page()
                
                url = f"https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page={page_num}"
                
                print(f"\n🌐 Teste Seite {page_num}...")
                
                await page.goto(url, wait_until="domcontentloaded", timeout=90000)
                await page.wait_for_timeout(5000)
                # Zeige vollständiges HTML von Cell[0]
                if page_num == 1:
                    cell0_full = await page.evaluate("""
                        () => {
                            const tbody = document.querySelector("table tbody");
                            if (!tbody) return "No tbody";
                            const firstRow = tbody.querySelector("tr");
                            if (!firstRow) return "No tr";
                            
                            const cells = firstRow.querySelectorAll("td");
                            return {
                                cell0Html: cells[0]?.innerHTML || "no cell",
                                cell1Html: cells[1]?.innerHTML || "no cell",
                                allImgs: document.querySelectorAll("img").length
                            };
                        }
                    """)
                    print(f"\n[Cell 0 - Full HTML]:\n{cell0_full['cell0Html'][:600]}")
                    print(f"\n[Cell 1 - Full HTML (first 400)]:\n{cell0_full['cell1Html'][:400]}")
                
                rankings_data = await page.evaluate("""
                    () => {
                        const results = [];
                        const tbody = document.querySelector("table tbody");
                        if (!tbody) return results;
                        
                        const rows = tbody.querySelectorAll("tr");
                        
                        rows.forEach((row) => {
                            try {
                                const cells = row.querySelectorAll("td");
                                
                                if (cells.length >= 3) {
                                    const playerName = cells[1]?.textContent?.trim() || "";
                                    const pointsText = cells[2]?.textContent?.trim()?.replace(/[.,]/g, '') || "";
                                    const points = parseInt(pointsText);
                                    
                                    // Extrahiere Flag aus Cell[1] (Player Name Zelle)
                                    let region = "";
                                    
                                    // Suche nach img tag in Cell[1]
                                    const img = cells[1]?.querySelector("img");
                                    if (img) {
                                        const src = img.src || img.getAttribute("src") || "";
                                        
                                        // Extrahiere Region aus src (z.B. "flag-dk.png" -> "DK" oder "flag-sco.png" -> "SCO")
                                        const match = src.match(/flag-([a-z]{2,5})/i);
                                        if (match) {
                                            region = match[1].toUpperCase();
                                            if (region === 'GLOBE') {
                                                region = 'GL';
                                            }
                                        }
                                    }
                                    
                                    if (playerName && !isNaN(points) && points > 0) {
                                        results.push({
                                            name: playerName,
                                            points: points,
                                            region: region || "UNKNOWN"
                                        });
                                    }
                                }
                            } catch (e) {
                                // Ignoriere Fehler
                            }
                        });
                        
                        return results;
                    }
                """)
                
                print(f"[Seite {page_num}] {len(rankings_data)} Spieler gefunden:")
                for player in rankings_data:
                    print(f"  {player['name']:<30} | {player['points']:>6} | Region: {player['region']}")
                
                all_rankings.extend(rankings_data)
                
                await context.close()
                    
            except Exception as e:
                print(f"[Seite {page_num}] Error: {str(e)[:100]}")
                continue
        
        await browser.close()

    return all_rankings

if __name__ == "__main__":
    rankings = asyncio.run(test_scrape())
    print(f"\nTotal: {len(rankings)} Spieler gescraped")
