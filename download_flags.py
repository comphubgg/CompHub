#!/usr/bin/env python3
"""
Download Fortnite Flag Images
Lädt alle Flaggen-Bilder von der Fortnite CDN herunter
"""

import os
import urllib.request
from pathlib import Path

REGION_CODES = [
    'US', 'CA', 'MX', 'BR', 'AR', 'GB', 'FR', 'DE', 'ES', 'IT',
    'RU', 'SE', 'NO', 'DK', 'PL', 'TR', 'KR', 'JP', 'CN', 'AU', 'EU'
]

FLAGS_DIR = Path(__file__).parent / 'public' / 'flags'
FLAGS_DIR.mkdir(parents=True, exist_ok=True)

print(f"📁 Lade Flaggen in: {FLAGS_DIR}")
print(f"🎮 Fortnite CDN: https://www.fortnite.com/competitive/images/flags/")

for region_code in REGION_CODES:
    flag_name = f'flag-{region_code.lower()}.png'
    flag_path = FLAGS_DIR / flag_name
    
    # Skip wenn schon vorhanden
    if flag_path.exists():
        print(f"  ✅ {flag_name} existiert bereits")
        continue
    
    url = f'https://www.fortnite.com/competitive/images/flags/{flag_name}'
    
    try:
        print(f"  ⬇️  Lade {flag_name}...", end=' ')
        urllib.request.urlretrieve(url, flag_path)
        print(f"✅")
    except Exception as e:
        print(f"❌ Fehler: {e}")
        # Versuche zu löschen wenn nicht erfolgreich
        if flag_path.exists():
            flag_path.unlink()

print("\n✅ Alle Flaggen heruntergeladen!")
print(f"📊 Flaggen im Ordner: {FLAGS_DIR}")
