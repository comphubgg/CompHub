# Produktionsnahe Fassung: Kurven nach Anteil x = e/C je Familie (lobby = Heats, offen = mehrere Lobbys), relative Streuungen.
import json, math
exec(open('backtest.py').read().split("# Prior-Streuung")[0])
def fam2(w): return 'lobby' if 'Heats' in w else 'offen'
GITTER = [i / 20 for i in range(21)]
def kurve_x(train):
    b = {}
    for v in train:
        for z in v['z']:
            x = round(z['e'] / v['cap'] * 20) / 20
            b.setdefault(x, []).append(z['L'] / v['F'])
    return sorted((x, sum(r) / len(r)) for x, r in b.items())
def ip(pts, x):
    if x <= pts[0][0]: return pts[0][1] * x / pts[0][0] if pts[0][0] else pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1: return y0 + (y1 - y0) * (x - x0) / (x1 - x0) if x1 > x0 else y0
    return pts[-1][1]
def streu_x(train, kv):
    b = {}
    for v in train:
        for z in v['z']:
            x = z['e'] / v['cap']; r = ip(kv, x)
            if r < 0.05: continue
            b.setdefault(round(x * 10) / 10, []).append((z['L'] / r - v['F']) / v['F'])
    return sorted((x, max(0.03, math.sqrt(sum(d * d for d in ds) / len(ds)))) for x, ds in b.items())
SP = 0.06
def vorhersage(L, e, cap, P, kv, sv, fertig=False):
    """Gibt (wert, gewicht_live) zurueck."""
    if fertig: return L, 1.0
    x = min(e / cap, 1.0); r = ip(kv, x)
    if r < 0.05 or P is None and r < 0.05: return (max(P, L) if P else None), 0.0
    R = L / r
    if P is None: return max(R, L), 1.0
    sR = ip(sv, x) * P; sP = SP * P
    w = (1 / sR**2) / (1 / sR**2 + 1 / sP**2)
    return max(w * R + (1 - w) * P, L), w
if __name__ == '__main__':
    res = {}; drops = []
    kurven = {}
    for fm in ['lobby', 'offen']:
        tr = [x for x in A if fam2(x['w']) == fm]; kv = kurve_x(tr); kurven[fm] = {'kurve': kv, 'streu': streu_x(tr, kv)}
    json.dump(kurven, open('kurven.json', 'w'))
    for v in A:
        tr = [x for x in A if x['w'] != v['w'] and fam2(x['w']) == fam2(v['w'])]
        kv = kurve_x(tr); sv = streu_x(tr, kv)
        prev = None
        for z in v['z']:
            p, w = vorhersage(z['L'], z['e'], v['cap'], v['P'], kv, sv, fertig=z['e'] >= v['cap'])
            key = z['g'] if v['lobby1'] else z['k']
            res.setdefault(fam(v['w']), {}).setdefault(v['w'], {}).setdefault(key, []).append(abs(p - v['F']))
            if prev is not None and p < prev: drops.append((prev - p, v['w'], z['k']))
            prev = p
    for fm, d in res.items():
        ks = sorted(set(k for x in d.values() for k in x))
        vals = []
        for k in ks:
            per = [sum(x[k]) / len(x[k]) for x in d.values() if k in x]; vals.append(sum(per) / len(per))
        print(fm, 'prod(ivw, Anteil-Kurve, Boden):', ' '.join(f'{k}:{x:.1f}' for k, x in zip(ks, vals)), ' Mittel', round(sum(vals) / len(vals), 1))
    drops.sort(reverse=True); print('groesste Rueckgaenge zwischen zwei Staenden', [(round(a, 1), w[-30:], k) for a, w, k in drops[:6]])
