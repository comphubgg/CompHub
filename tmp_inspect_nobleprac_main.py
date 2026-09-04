from pathlib import Path
import re
js = Path('tmp_nobleprac_main.js').read_text(encoding='utf-8', errors='replace')
lines = js.splitlines()
print('total lines', len(lines))
for i in range(1695, 1710):
    if i < len(lines):
        print(f'{i+1}: {lines[i]}')

patterns = [
    (re.compile(r'REACT_APP_PROD_TOURNAMENT_SERVER_URL\\"\\:\\"([^\\"]+)\\"'), 'PROD_TOURNAMENT_SERVER_URL'),
    (re.compile(r'REACT_APP_PROD_SESSION_SERVER_URL\\"\\:\\"([^\\"]+)\\"'), 'PROD_SESSION_SERVER_URL'),
    (re.compile(r'REACT_APP_PROD_TICKETS_SERVER_URL\\"\\:\\"([^\\"]+)\\"'), 'PROD_TICKETS_SERVER_URL'),
    (re.compile(r'"(https?://tournaments\.nobleprac\.com[^"\']*)"'), 'tournaments absolute'),
    (re.compile(r'"(/tournaments[^"\']*)"'), 'tournaments route'),
    (re.compile(r'"(/api[^"\']*)"'), 'api route'),
]
for label, pat in patterns:
    print('\n===', label, '===')
    seen = set()
    for m in pat.finditer(js):
        val = m.group(1)
        if val in seen:
            continue
        seen.add(val)
        print(val)
        if len(seen) >= 20:
            break
