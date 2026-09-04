import re
import urllib.request
from urllib.error import URLError, HTTPError

url = 'https://nobleprac.com/tournaments/S41-FNCS'
headers = {'User-Agent': 'Mozilla/5.0'}
req = urllib.request.Request(url, headers=headers)
html = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', errors='replace')
match = re.search(r'<script\s+defer\s+src=["\']([^"\']+)["\']', html, re.I)
if not match:
    print('no script')
    raise SystemExit(1)
js_url = urllib.request.urljoin(url, match.group(1))
print('JS URL:', js_url)
js = urllib.request.urlopen(urllib.request.Request(js_url, headers=headers), timeout=30).read().decode('utf-8', errors='replace')

def show_matches(pattern, label):
    print('\n===', label, '===')
    for m in pattern.finditer(js):
        start = max(0, m.start() - 80)
        end = min(len(js), m.end() + 80)
        snippet = js[start:end].replace('\n', '\\n')
        print('match:', m.group(0))
        print(snippet)
        print('---')

# domain pattern with possible broken escaping
show_matches(re.compile(r'https?://tournaments\.nobleprac\.com[^"\'\s\)\]\|]*'), 'tournaments.nobleprac.com URLs')
show_matches(re.compile(r'https?://map\.nobleprac\.com[^"\'\s\)\]\|]*'), 'map.nobleprac.com URLs')
show_matches(re.compile(r'REACT_APP_PROD_TOURNAMENT_SERVER_URL|PROD_TOURNAMENT_SERVER_URL', re.I), 'env vars')
show_matches(re.compile(r'"(/tournaments[^"\']*)"'), 'tournaments routes')
show_matches(re.compile(r'"(/api[^"\']*)"'), 'api routes')
show_matches(re.compile(r'\bfetch\([^\)]*\)'), 'fetch calls')
show_matches(re.compile(r'\baxios\.[getpost]+\([^\)]*\)'), 'axios calls')
print('\nDone')
