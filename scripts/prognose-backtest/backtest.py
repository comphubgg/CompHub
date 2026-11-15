# Backtest der Prognose waehrend des Spieltags (app/api/qualifikation, mitteRechnen), 15.11.2026.
# Ablauf (in diesem Ordner): node holen.mjs roh <Fenster...>   -> volle Replays je Match, Endstand, Wertung
#   python3 verlauf2.py   -> Grenze nach jedem Ausscheiden, je Spieler gegen Epics Endstand geprueft (verlauf2.json)
#   python3 backtest.py   -> MAE je Methode und Spielstand;  python3 prod.py -> die eingebaute Fassung (schreibt kurven.json = KURVEN in route.ts)
#   python3 replay_eu.py <Fenster> <Vorab>   -> Nachspielen eines Spieltags, alte Sperre gegen neu
import json, math, statistics as st, sys
A = [v for v in json.load(open('verlauf2.json')) if v['F'] and v['pruef'] and v['pruef'] >= 0.9]
def fam(w):
    if 'S43_FNCSSoloReload_Heats' in w: return 'S43heat'
    if 'S42_FNCSSolo_Heats' in w: return 'S42heat'
    return 'S43r3'
def reg(w): return w.rsplit('_', 1)[1]
byw = {v['w']: v for v in A}
# Vorab-Prognose (Prior): Heat -> der andere Heat derselben Region (wie heatVorlage), Round 3 -> Schnitt der anderen Regionen
def prior(v):
    w = v['w']
    if 'Heat' in w:
        other = w.replace('Heat1', 'HeatX').replace('Heat2', 'Heat1').replace('HeatX', 'Heat2')
        if other in byw: return byw[other]['F']
        return None
    o = [x['F'] for x in A if fam(x['w']) == fam(w) and x['w'] != w]
    return round(sum(o) / len(o))
for v in A: v['P'] = prior(v)
A = [v for v in A if v['P']]
# Fortschritt: Kurve L/F an der mittleren Spielzahl e der Raenge sch/2..sch
def kurve(train, key='e'):
    # Mittel von L/F je 0.25-Schritt von e, linear interpoliert
    b = {}
    for v in train:
        for z in v['z']:
            x = round(z[key] * 4) / 4
            b.setdefault(x, []).append(z['L'] / v['F'])
    pts = sorted((x, sum(r) / len(r), len(r)) for x, r in b.items())
    return pts
def interp(pts, x):
    if x <= pts[0][0]: return pts[0][1] * (x / pts[0][0]) if pts[0][0] > 0 else pts[0][1]
    for (x0, y0, _), (x1, y1, _) in zip(pts, pts[1:]):
        if x0 <= x <= x1: return y0 + (y1 - y0) * (x - x0) / (x1 - x0) if x1 > x0 else y0
    return pts[-1][1]
def train_set(v, pool='fam'):
    return [x for x in A if x['w'] != v['w'] and (pool == 'all' or fam(x['w']) == fam(v['w']))
            and not (fam(v['w']) != 'S43r3' and reg(x['w']) == reg(v['w']) and False)]
# Streuung des Verhaeltnis-Schaetzers je e (LOO), fuer die Gewichtung gegen den Prior
def methoden(v, kv, sR, sP):
    cap = v['cap']; P = v['P']; out = {}
    lock = None; k0 = math.ceil(cap * 0.6)
    for z in v['z']:
        L, k, e = z['L'], z['k'], z['e']
        r = interp(kv, e) if e > 0 else None
        R = L / r if r and r > 0.02 else None
        # A: heutige Sperre
        if lock is None and k >= k0 and k < cap and cap >= 4:
            hoch = round(L * cap / k); lock = ('P' if abs(hoch - P) <= P * 0.03 else hoch)
        a = P if lock in (None, 'P') else lock
        lin = L * cap / max(k, 1)
        # Inverse Varianz
        if R is not None:
            s = sR(e); wR = 1 / s**2; wP = 1 / sP**2
            ivw = (R * wR + P * wP) / (wR + wP)
        else: ivw = P
        frac = min(e / cap, 1)
        blend = frac**2 * (R if R else P) + (1 - frac**2) * P
        res = {
            'lock (heute)': a,
            'prior': P,
            'linear L*C/k': lin,
            'ratio(e)': R if R else P,
            'blend w=(e/C)^2': blend,
            'ivw prior+ratio': ivw,
            'lock+floor': max(a, L),
            'prior+floor': max(P, L),
            'ratio+floor': max(R if R else P, L),
            'blend2+floor': max(blend, L),
            'ivw+floor': max(ivw, L),
        }
        for m, p in res.items(): out.setdefault(m, []).append((z, p))
    return out
def sR_fn(v, kv, train):
    # Fehler des Verhaeltnis-Schaetzers in den Trainingsfenstern (relativ), je e-Bucket
    b = {}
    for x in train:
        for z in x['z']:
            r = interp(kv, z['e']) if z['e'] > 0 else None
            if not r or r < 0.02: continue
            b.setdefault(round(z['e']), []).append(z['L'] / r - x['F'])
    sd = {k: max(3.0, math.sqrt(sum(d * d for d in ds) / len(ds))) for k, ds in b.items()}
    def f(e):
        k = round(e)
        return sd.get(k, sd[min(sd, key=lambda q: abs(q - k))])
    return f
# Prior-Streuung je Familie
sPfam = {}
for fm in set(fam(v['w']) for v in A):
    ds = [v['P'] - v['F'] for v in A if fam(v['w']) == fm]
    sPfam[fm] = math.sqrt(sum(d * d for d in ds) / len(ds))
print('Prior RMSE je Familie', {k: round(x, 1) for k, x in sPfam.items()})
ergeb = {}  # fam -> methode -> bucket -> [abs err]
replays = {}
for v in A:
    tr = train_set(v); kv = kurve(tr); sR = sR_fn(v, kv, tr)
    out = methoden(v, kv, sR, sPfam[fam(v['w'])])
    fm = fam(v['w'])
    for m, lst in out.items():
        # je Fenster: Fehler am Ende jedes Spiels k (Lobby: g wechselt) und im Spiel (Mittel ueber Zwischenstaende)
        per = {}
        for z, p in lst:
            key = z['g'] if v['lobby1'] else z['k']
            per.setdefault(key, []).append(abs(p - v['F']))
        for key, es in per.items():
            ergeb.setdefault(fm, {}).setdefault(m, {}).setdefault(key, []).append(sum(es) / len(es))
json.dump({fm: {m: {k: sum(x)/len(x) for k, x in b.items()} for m, b in d.items()} for fm, d in ergeb.items()}, open('ergebnis.json', 'w'))
for fm, d in ergeb.items():
    n = len([v for v in A if fam(v['w']) == fm])
    ks = sorted(next(iter(d.values())).keys())
    print(f'\n== {fm} ({n} Fenster) - MAE in Punkten, Zeitmittel waehrend Stand k (Heats: k fertige Spiele; Round 3: k = Spielzahl auf der Seite)')
    print(f"{'Methode':22}" + ''.join(f'{k:>6}' for k in ks) + '   Mittel')
    for m, b in d.items():
        vals = [sum(b[k]) / len(b[k]) if k in b else float('nan') for k in ks]
        print(f'{m:22}' + ''.join(f'{x:6.1f}' for x in vals) + f'  {sum(vals)/len(vals):6.1f}')
