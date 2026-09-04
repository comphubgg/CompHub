from pathlib import Path
import re

path = Path('tmp_nobleprac_main.js')
text = path.read_text(encoding='utf-8', errors='replace')
keys = [
    'REACT_APP_PROD_TOURNAMENT_SERVER_URL',
    'REACT_APP_PROD_SCRIM_TOURNAMENT_API_ROUTE',
    'REACT_APP_PROD_TOURNAMENT_API_ROUTE',
    'TOURNAMENT_API_ROUTE',
    'SCRIM_TOURNAMENT_API_ROUTE',
    'TOURNAMENT_SERVER_URL',
    'SCRIM_TOURNAMENT_SERVER_URL',
]
for key in keys:
    print('===', key, '===')
    for match in re.finditer(re.escape(key), text):
        start = max(0, match.start() - 200)
        end = min(len(text), match.end() + 400)
        snippet = text[start:end]
        print('at', match.start())
        print(snippet)
        print('---')
        break

print('=== exact env object snippet around PROD Tourney URL ===')
idx = text.find('REACT_APP_PROD_TOURNAMENT_SERVER_URL')
if idx != -1:
    start = max(0, idx - 400)
    end = min(len(text), idx + 800)
    print(text[start:end])
else:
    print('not found')
