from pathlib import Path
import re

path = Path('tmp_nobleprac_main.js')
text = path.read_text(encoding='utf-8', errors='replace')
patterns = [
    r'TOURNAMENT_API_ROUTE',
    r'SCRIM_TOURNAMENT_API_ROUTE',
    r'TOURNAMENT_SERVER_URL',
    r'REACT_APP_PROD_TOURNAMENT_SERVER_URL',
    r'"/tournament\?id=',
    r'"/tournaments\?guildId=',
    r'"/tournaments/:id',
    r'"/tournaments/usernameUpdate\?accountId=',
]
for pat in patterns:
    print('=== Pattern:', pat, '===')
    for m in re.finditer(pat, text):
        start = max(0, m.start() - 200)
        end = min(len(text), m.end() + 400)
        snippet = text[start:end]
        print('--- match at', m.start())
        print(snippet)
        print('----')
        break
    else:
        print('not found')
