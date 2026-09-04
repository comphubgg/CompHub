import re, urllib.request
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

patterns = [
    (re.compile(r'REACT_APP_PROD_TOURNAMENT_SERVER_URL\":\"([^\"]+)\"'), 'prod tournament server url'),
    (re.compile(r'"(https?://tournaments\.nobleprac\.com[^"\']*)"'), 'tournaments absolute url'),
    (re.compile(r'\"(https?://tournaments\.nobleprac\.com[^\"]*)\"'), 'escaped tournaments absolute url'),
    (re.compile(r'\"(/tournaments[^\"]*)\"'), 'escaped tournaments route'),
    (re.compile(r'"(/tournaments[^"\']*)"'), 'tournaments route'),
    (re.compile(r'\"(/api[^\"]*)\"'), 'escaped api route'),
    (re.compile(r'"(/api[^"\']*)"'), 'api route'),
    (re.compile(r'\"(/v[0-9]+/[^\"]*)\"'), 'escaped v*/ route'),
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
        if len(seen) >= 50:
            break
print('\nDone')
