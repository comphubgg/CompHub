import re
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

url = 'https://nobleprac.com/tournaments/S41-FNCS'
headers = {'User-Agent': 'Mozilla/5.0'}

req = Request(url, headers=headers)
try:
    with urlopen(req, timeout=30) as resp:
        html = resp.read().decode('utf-8', errors='replace')
except Exception as exc:
    print('error fetching html:', exc)
    raise

m = re.search(r'<script\s+defer\s+src=["\']([^"\']+)["\']', html, re.I)
if not m:
    print('no script tag found')
    raise SystemExit(1)
js_url = re.sub(r'^//', 'https://', m.group(1))
if js_url.startswith('/'):
    from urllib.parse import urljoin
    js_url = urljoin(url, js_url)
print('jsUrl', js_url)

req = Request(js_url, headers=headers)
try:
    with urlopen(req, timeout=30) as resp:
        js = resp.read().decode('utf-8', errors='replace')
except Exception as exc:
    print('error fetching js:', exc)
    raise

pattern = re.compile(r'https?://tournaments\.nobleprac\.com[^"\'\s\)\]]*')
matches = pattern.findall(js)
print('found', len(matches), 'matches')
for v in sorted(set(matches)):
    print(v)

api_pattern = re.compile(r'"(/tournaments(?:/[\w\-\.%]+)*(?:\?[\w\-\.%=&;]*)?)"')
seen = set()
for m in api_pattern.finditer(js):
    route = m.group(1)
    if route not in seen:
        seen.add(route)
        print('route', route)
