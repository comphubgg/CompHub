import re
import urllib.request
from urllib.error import URLError, HTTPError
from urllib.parse import urljoin

url = 'https://nobleprac.com/tournaments/S41-FNCS'
headers = {'User-Agent': 'Mozilla/5.0'}

req = urllib.request.Request(url, headers=headers)
html = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', errors='replace')
script_match = re.search(r'<script\s+defer\s+src=["\']([^"\']+)["\']', html, re.I)
if not script_match:
    raise SystemExit('no script tag found')
js_url = urljoin(url, script_match.group(1))
print('JS URL:', js_url)
js = urllib.request.urlopen(urllib.request.Request(js_url, headers=headers), timeout=30).read().decode('utf-8', errors='replace')

patterns = [
    (re.compile(r'REACT_APP_PROD_TOURNAMENT_SERVER_URL\"\:\"([^\"]+)\"'), 'prod tournament server url'),
    (re.compile(r'REACT_APP_DEV_TOURNAMENT_SERVER_URL\"\:\"([^\"]+)\"'), 'dev tournament server url'),
    (re.compile(r'REACT_APP_PROD_SESSION_SERVER_URL\"\:\"([^\"]+)\"'), 'prod session server url'),
    (re.compile(r'REACT_APP_DEV_SESSION_SERVER_URL\"\:\"([^\"]+)\"'), 'dev session server url'),
    (re.compile(r'REACT_APP_PROD_TICKETS_SERVER_URL\"\:\"([^\"]+)\"'), 'prod tickets server url'),
    (re.compile(r'REACT_APP_DEV_TICKETS_SERVER_URL\"\:\"([^\"]+)\"'), 'dev tickets server url'),
    (re.compile(r'"(https?://tournaments\.nobleprac\.com[^"\']*)"'), 'tournaments absolute url'),
    (re.compile(r'"(https?://map\.nobleprac\.com[^"\']*)"'), 'map absolute url'),
    (re.compile(r'"(https?://auth\.nobleprac\.com[^"\']*)"'), 'auth absolute url'),
    (re.compile(r'"(https?://tickets\.nobleprac\.com[^"\']*)"'), 'tickets absolute url'),
    (re.compile(r'"(/tournaments[^"]*)"'), 'tournaments route'),
    (re.compile(r'"(/api[^"]*)"'), 'api route'),
    (re.compile(r'"(/v[0-9]+/[^"]*)"'), 'versioned route'),
]

seen = set()
for pat, label in patterns:
    print('\n===', label, '===')
    count = 0
    for m in pat.finditer(js):
        val = m.group(1)
        if val in seen:
            continue
        seen.add(val)
        print(val)
        count += 1
        if count >= 40:
            break
print('\nDone')
