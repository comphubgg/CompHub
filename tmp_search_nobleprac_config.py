from pathlib import Path
import re

js_path = Path('tmp_nobleprac_main.js')
js = js_path.read_text(encoding='utf-8', errors='replace')
print('Length:', len(js))

patterns = [
    (r'REACT_APP_PROD_TOURNAMENT_SERVER_URL\\"\\:\\"([^\\"]+)\\"', 'env escaped'),
    (r'REACT_APP_PROD_TOURNAMENT_SERVER_URL"\:\"([^\"]+)"', 'env nonescaped'),
    (r'"https?://tournaments\.nobleprac\.com[^"\']*"', 'absolute tournaments'),
    (r'"/tournaments[^"\']*"', 'tournaments routes'),
    (r'"/api[^"\']*"', 'api routes'),
    (r'"/tournament[^"\']*"', 'tournament routes'),
    (r'"[^"]*TOURNAMENT_API_ROUTE[^"]*"', 'TOURNAMENT_API_ROUTE expressions'),
]

for pat, label in patterns:
    print('\n===', label, '===')
    rx = re.compile(pat)
    found = 0
    for m in rx.finditer(js):
        found += 1
        print(m.group(0)[:400])
        if found >= 20:
            break
    print('total found:', found)

# prints around first location of the config object
needle = 'REACT_APP_PROD_TOURNAMENT_SERVER_URL'
idx = js.find(needle)
print('\nneedle index:', idx)
if idx != -1:
    start = max(0, idx - 400)
    end = min(len(js), idx + 400)
    snippet = js[start:end]
    print(snippet.replace('\n','\\n'))
