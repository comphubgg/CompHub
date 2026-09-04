import re, urllib.request
from urllib.parse import urljoin

url = 'https://nobleprac.com/tournaments/S41-FNCS'
headers = {'User-Agent': 'Mozilla/5.0'}
req = urllib.request.Request(url, headers=headers)
html = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', errors='replace')
script_match = re.search(r'<script\s+defer\s+src=["\']([^"\']+)["\']', html, re.I)
if not script_match:
    raise SystemExit('no script')
js_url = urljoin(url, script_match.group(1))
print('JS URL:', js_url)
js = urllib.request.urlopen(urllib.request.Request(js_url, headers=headers), timeout=30).read().decode('utf-8', errors='replace')
with open('tmp_nobleprac_main.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('saved main js file length', len(js))
