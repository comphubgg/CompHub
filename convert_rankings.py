#!/usr/bin/env python3
import json
from datetime import datetime

# Lese die alte Struktur
with open('rankings_all_regions.json', 'r', encoding='utf-8') as f:
    old_data = json.load(f)

# Kombiniere alle Spieler aus allen Regionen
all_players = []

for region_code, region_data in old_data.items():
    for player in region_data['rankings']:
        player_copy = player.copy()
        player_copy['region'] = region_code
        all_players.append(player_copy)

# Sortiere nach Punkten
all_players.sort(key=lambda x: x['points'], reverse=True)

# Nummeriere neu
for idx, player in enumerate(all_players, 1):
    player['rank'] = idx

# Speichere in neuem Format
new_data = {
    "extracted_at": datetime.now().isoformat(),
    "player_count": len(all_players),
    "rankings": all_players
}

with open('rankings_all_regions.json', 'w', encoding='utf-8') as f:
    json.dump(new_data, f, indent=2, ensure_ascii=False)

print(f"✅ Konvertiert! {len(all_players)} Spieler total")
print(f"\nTop 10:")
for p in all_players[:10]:
    print(f"  {p['rank']}. {p['name']:<30} {p['points']:>10} Punkte [{p['region']}]")
