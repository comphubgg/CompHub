import urllib.request
import re

url = 'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=1'
req = urllib.request.Request(url, headers={
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
})
with urllib.request.urlopen(req, timeout=30) as resp:
    text = resp.read().decode('utf-8', errors='replace')

print('STATUS OK')
print('HAS TABLE', '<table' in text.lower())
print('TABLE COUNT', text.lower().count('<table'))
print('SCRIPTS', len(re.findall(r'<script[^>]+src=["\\']', text, re.I)))
print('FIRST 2000 CHARS:')
print(text[:2000])
print('--- SEARCH ---')
for marker in ['PR SCORE', 'PR', 'POINTS', 'rank', 'table', 'thead', 'tbody', 'power-rankings', 'src="', 'data-', 'window.__']:
    if marker.lower() in text.lower():
        print(marker, text.lower().find(marker.lower()))
