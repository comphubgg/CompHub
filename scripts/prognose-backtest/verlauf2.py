# Feiner Verlauf: nach jedem Ausscheiden (Epic schreibt die Sitzung eines Spielers, sobald er raus ist) die Bestenliste wie live.
import json, glob, datetime, sys
from verlauf import wertung, schwelle_von, cap_von, ts
def verlauf_fein(f):
    d = json.load(open(f)); w = d['windowId']
    W = wertung(d)
    if not W: return None
    plp, elp = W
    sch = schwelle_von(w); cap = cap_von(w, d) if d.get('teams') else (8 if 'Heats' in w else 12)
    ev = []; spielende = []
    for m in d['matches']:
        b = ts(m['beginn']); L = (m['laenge'] or 0) / 1000; off = (m['ende'] or L) - L
        mend = b + L; spielende.append(mend)
        for s in m['spieler']:
            if 'epic' not in s or not s.get('platz'): continue
            t = b + (s['tod'] - off) if s.get('tod') is not None else mend
            t = min(max(t, b), mend)
            ev.append((t, s['epic'], plp(s['platz']) + elp(s.get('kills') or 0)))
    ev.sort(); spielende.sort()
    pts = {}; n = {}; z = []; i = 0
    while i < len(ev):
        t = ev[i][0]
        while i < len(ev) and ev[i][0] == t:
            _, p, v = ev[i]; pts[p] = pts.get(p, 0) + v; n[p] = n.get(p, 0) + 1; i += 1
        rang = sorted(pts.items(), key=lambda x: -x[1])
        if len(rang) < sch: continue
        L = rang[sch-1][1]
        top = rang[:sch]
        k = max(n[p] for p, _ in top)
        sofort = 1000 if ('Heats' in w) else None
        h = [p for p, v in top if not (sofort and v >= sofort)] or [p for p, _ in top]
        e = sum(n[p] for p in h) / len(h)  # mittlere Spielzahl der Eintraege bis zur Grenze, ohne sofort Qualifizierte
        g = sum(1 for x in spielende if x <= t)  # fertige Spiele (nur bei einer Lobby aussagekraeftig)
        z.append({'t': t, 'k': k, 'e': round(e, 3), 'g': g, 'L': L})
    F = None; pr = None
    if d.get('teams'):
        F = next((tm['punkte'] for tm in d['teams'] if tm['platz'] == sch), None)
        ok = sum(1 for tm in d['teams'] if abs(pts.get(tm['spieler'][0], -999) - tm['punkte']) <= 6 and n.get(tm['spieler'][0]) == tm['matches'])
        pr = ok / len(d['teams'])
    return {'w': w, 'sch': sch, 'cap': cap, 'F': F, 'pruef': pr, 'z': z, 'lobby1': 'Heats' in w}
if __name__ == '__main__':
    alle = [v for f in sorted(glob.glob('roh/*.json')) if (v := verlauf_fein(f))]
    for v in alle: print(v['w'], v['F'], v['z'][-1]['L'] if v['z'] else None, 'pruef', v['pruef'], 'n', len(v['z']))
    json.dump(alle, open('verlauf2.json', 'w'))
