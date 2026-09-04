import re
from pathlib import Path

path = Path('tmp_nobleprac_main.js')
js = path.read_text(encoding='utf-8', errors='replace')
print('length', len(js))

patterns = [
    (re.compile(r'REACT_APP_PROD_TOURNAMENT_SERVER_URL\\"\\:\\"([^\\"]+)\\"'), 'PROD_TOURNAMENT_SERVER_URL'),
    (re.compile(r'REACT_APP_DEV_SESSION_SERVER_URL\\"\\:\\"([^\\"]+)\\"'), 'DEV_SESSION_SERVER_URL'),
    (re.compile(r'REACT_APP_PROD_SESSION_SERVER_URL\\"\\:\\"([^\\"]+)\\"'), 'PROD_SESSION_SERVER_URL'),
    (re.compile(r'REACT_APP_PROD_TICKETS_SERVER_URL\\"\\:\\"([^\\"]+)\\"'), 'PROD_TICKETS_SERVER_URL'),
    (re.compile(r'"(https?://tournaments\.nobleprac\.com[^"\']*)"'), 'tournaments absolute'),
    (re.compile(r'"(https?://map\.nobleprac\.com[^"\']*)"'), 'map absolute'),
    (re.compile(r'"(/tournaments[^"\']*)"'), 'tournaments route'),
    (re.compile(r'"(/api[^"\']*)"'), 'api route'),
    (re.compile(r'"(/v[0-9]+/[^"\']*)"'), 'versioned route'),
    (re.compile(r'"([^"]*tournament[^"]*)"', re.I), 'tournament strings'),
    (re.compile(r'"([^"]*stage[^"]*)"', re.I), 'stage strings'),
    (re.compile(r'"([^"]*match[^"]*)"', re.I), 'match strings'),
    (re.compile(r'"([^"]*entry[^"]*)"', re.I), 'entry strings'),
    (re.compile(r'"([^"]*player[^"]*)"', re.I), 'player strings'),
    (re.compile(r'"([^"]*team[^"]*)"', re.I), 'team strings'),
]

for pat, label in patterns:
    print('\n===', label, '===')
    seen = set()
    for m in pat.finditer(js):
        val = m.group(1)
        if val in seen:
            continue
        seen.add(val)
        print(val)
        if len(seen) >= 30:
            break

# find fetch calls with live endpoint patterns
print('\n=== fetch or axios patterns ===')
for pat in [r'fetch\([^\)]*\)', r'axios\.[a-z]+\([^\)]*\)']:
    seen = set()
    for m in re.finditer(pat, js):
        val = m.group(0)
        if val in seen:
            continue
        seen.add(val)
        print(val[:200])
        if len(seen) >= 30:
            break

# heuristic route extraction from slash patterns
print('\n=== heuristic /tournaments templates ===')
route_pat = re.compile(r'(/tournaments(?:/[^"\']*)?)')
seen = set()
for m in route_pat.finditer(js):
    val = m.group(1)
    if len(val) > 1 and val not in seen:
        seen.add(val)
        print(val)
        if len(seen) >= 50:
            break
