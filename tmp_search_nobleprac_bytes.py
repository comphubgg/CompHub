from pathlib import Path
import re

path = Path('tmp_nobleprac_main.js')
raw = path.read_bytes()
print('bytes', len(raw), 'starts', raw[:80])
for term in [b'REACT_APP_PROD_TOURNAMENT_SERVER_URL', b'REACT_APP_PROD_AUTH_URL', b'TOURNAMENT_API_ROUTE', b'SCRIM_TOURNAMENT_API_ROUTE', b'tournaments.nobleprac.com', b'"/tournaments', b'"/tournaments?guildId', b'"/tournament?id']:
    idx = raw.find(term)
    print(term, idx)
    if idx != -1:
        start = max(0, idx-200)
        end = min(len(raw), idx+200)
        print(raw[start:end])
        print('------')
