#!/usr/bin/env python3
import asyncio
from playwright.async_api import async_playwright

async def debug():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        url = "https://www.fortnite.com/competitive/power-rankings?region=NAE&pageSize=100"
        print(f"Öffne: {url}")
        await page.goto(url, wait_until="networkidle", timeout=30000)
        
        # Speichere Screenshot
        await page.screenshot(path="debug.png")
        print("✅ Screenshot gespeichert: debug.png")
        
        # Suche nach verschiedenen Selektoren
        print("\n🔍 Suche nach Elementen:")
        
        # Test 1: table
        try:
            tables = await page.locator("table").count()
            print(f"  Tables gefunden: {tables}")
        except:
            print("  Keine tables gefunden")
        
        # Test 2: Verschiedene Row-Selektoren
        row_selectors = [
            "table tbody tr",
            "[role='row']",
            "tr[data-testid]",
            ".ranking-row",
            "[data-testid*='rank']"
        ]
        
        for selector in row_selectors:
            try:
                count = await page.locator(selector).count()
                print(f"  {selector}: {count}")
            except:
                print(f"  {selector}: Error")
        
        # Test 3: Dump des HTML
        content = await page.content()
        
        # Suche nach "big tryona" oder anderen Spielernamen
        if "Scroll" in content or "player" in content.lower():
            print("\n✅ Spielernamen-Daten gefunden!")
            
            # Schaue nach der Struktur
            start = content.find("<table")
            if start != -1:
                print("\n📋 Table HTML (erste 1000 Zeichen):")
                print(content[start:start+2000])
        else:
            print("\n❌ Keine Spielerdaten in der Seite gefunden")
            print(f"HTML-Länge: {len(content)}")
            
            # Versuche JSON zu finden
            if "rankings" in content.lower():
                print("✅ 'rankings' im HTML gefunden")
            if "json" in content.lower():
                print("✅ 'json' im HTML gefunden")
        
        await browser.close()

asyncio.run(debug())
