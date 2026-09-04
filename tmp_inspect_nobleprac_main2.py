from pathlib import Path
import re

js = Path('tmp_nobleprac_main.js').read_text(encoding='utf-8', errors='replace')
lines = js.splitlines()
with open('tmp_inspect_nobleprac_main2.out.txt', 'w', encoding='utf-8') as out:
    out.write(f'total lines {len(lines)}\n')
    for i in range(1690, 1710):
        if i < len(lines):
            out.write(f'{i+1}: {lines[i]}\n')
    out.write('\n=== env values ===\n')
    for pat in [
        re.compile(r'REACT_APP_PROD_TOURNAMENT_SERVER_URL\\"\\:\\"([^\\"]+)\\"'),
        re.compile(r'REACT_APP_PROD_SESSION_SERVER_URL\\"\\:\\"([^\\"]+)\\"'),
        re.compile(r'REACT_APP_PROD_TICKETS_SERVER_URL\\"\\:\\"([^\\"]+)\\"'),
        re.compile(r'REACT_APP_PROD_AUTH_URL\\"\\:\\"([^\\"]+)\\"'),
    ]:
        for m in pat.finditer(js):
            out.write(m.group(0) + '\n')
    out.write('\n=== absolute tournaments URLs ===\n')
    seen = set()
    for m in re.finditer(r'"(https?://tournaments\.nobleprac\.com[^"]*)"', js):
        val = m.group(1)
        if val not in seen:
            seen.add(val)
            out.write(val + '\n')
            if len(seen) >= 50:
                break
    out.write('\n=== /tournaments routes ===\n')
    seen = set()
    for m in re.finditer(r'"(/tournaments[^"\']*)"', js):
        val = m.group(1)
        if val not in seen:
            seen.add(val)
            out.write(val + '\n')
            if len(seen) >= 50:
                break
    out.write('\n=== /api routes ===\n')
    seen = set()
    for m in re.finditer(r'"(/api[^"\']*)"', js):
        val = m.group(1)
        if val not in seen:
            seen.add(val)
            out.write(val + '\n')
            if len(seen) >= 50:
                break
    out.write('\n=== fetch calls snippet ===\n')
    for m in re.finditer(r'fetch\([^\)]*\)', js):
        snippet = m.group(0)
        out.write(snippet[:200] + '\n')
        break
    out.write('\n=== axios calls snippet ===\n')
    for m in re.finditer(r'axios\.[a-zA-Z]+\([^\)]*\)', js):
        out.write(m.group(0)[:200] + '\n')
        break
    out.write('\nDone\n')
