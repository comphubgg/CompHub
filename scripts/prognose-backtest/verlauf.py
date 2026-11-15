# Rekonstruiert je Fenster den Verlauf der Qual-Grenze (Punkte auf Rang schwelle) nach jedem Match-Ende aus den vollen Replays.
import json, glob, sys, datetime
S42_HEAT_TAB = [1000,53,49,46,46,45,44,43,42,41,40,39,38,37,36,36,34,33,33,31,30,29,28,28,25,25,23,23,22,21,21,20,18,17,16,15,14,13,13,11,9,9,8,7,6,7,4,3,2,3]  # per Ausgleich (fit.py), Elim 3
def wertung(d):
    w = d['windowId']
    if d.get('regeln'):
        R = d['regeln']
        def plp(p): return sum(r['punkte'] for r in R if r['was']=='Placement' and p <= r['schwelle'])
        def elp(k):
            s = 0
            for r in R:
                if r['was'] != 'Elimination': continue
                if r['jeStueck']: s += r['punkte'] * k if k >= r['schwelle'] else 0
                elif k >= r['schwelle']: s += r['punkte']
            return s
        return plp, elp
    if 'S42_FNCSSolo_Heats' in w:
        return (lambda p: S42_HEAT_TAB[p-1] if p <= len(S42_HEAT_TAB) else 0), (lambda k: 3*k)
    return None
def schwelle_von(w):
    if 'S43_FNCSSoloReload_Heats' in w: return 15
    if 'S42_FNCSSolo_Heats' in w: return int(SCHW42) if (SCHW42:=globals().get('S42H', 35)) else 35
    if 'S43_FNCSSoloReloadQualifiers' in w and 'Round3' in w: return 80
    if 'S42_FNCSSoloQualifiers' in w and 'Round3' in w: return 100
    raise ValueError(w)
def cap_von(w, d):
    if 'S43_FNCSSoloReload_Heats' in w: return 8
    if 'S42_FNCSSolo_Heats' in w: return 6
    return max(t['matches'] for t in d['teams'])
def ts(s): return datetime.datetime.fromisoformat(s).replace(tzinfo=datetime.timezone.utc).timestamp()
def verlauf(f):
    d = json.load(open(f)); w = d['windowId']
    W = wertung(d)
    if not W: return None
    plp, elp = W
    sch = schwelle_von(w); cap = cap_von(w, d) if d.get('teams') else 8
    ereignisse = []
    for m in d['matches']:
        ende = ts(m['beginn']) + (m['laenge'] or 0)/1000
        for s in m['spieler']:
            if 'epic' not in s or not s.get('platz'): continue
            ereignisse.append((ende, s['epic'], plp(s['platz']) + elp(s.get('kills') or 0)))
    ereignisse.sort()
    pts = {}; n = {}; zust = []
    i = 0
    while i < len(ereignisse):
        t = ereignisse[i][0]
        while i < len(ereignisse) and ereignisse[i][0] == t:
            _, p, v = ereignisse[i]; pts[p] = pts.get(p, 0) + v; n[p] = n.get(p, 0) + 1; i += 1
        rang = sorted(pts.items(), key=lambda x: -x[1])
        L = rang[sch-1][1] if len(rang) >= sch else 0
        k = max(n[p] for p, _ in rang[:sch])
        zust.append({'t': t, 'k': k, 'L': L})
    # Pruefung gegen Epics Endstand
    pruef = None; F = None
    if d.get('teams'):
        ok = 0; nah = 0
        for tm in d['teams']:
            p = tm['spieler'][0]
            if pts.get(p) == tm['punkte'] and n.get(p) == tm['matches']: ok += 1
            if abs(pts.get(p, -999) - tm['punkte']) <= 6 and n.get(p) == tm['matches']: nah += 1
        pruef = {'genau': ok, 'nah6': nah, 'von': len(d['teams'])}
        F = next((tm['punkte'] for tm in d['teams'] if tm['platz'] == sch), None)
    return {'w': w, 'sch': sch, 'cap': cap, 'F': F, 'Frek': zust[-1]['L'] if zust else None, 'pruef': pruef, 'zust': zust, 'matches': len(d['matches']), 'ids': len(d['matchIds'])}
if __name__ == '__main__':
    alle = []
    for f in sorted(glob.glob('roh/*.json')):
        v = verlauf(f)
        if not v: print('ohne Wertung', f); continue
        alle.append(v)
        print(v['w'], 'sch', v['sch'], 'cap', v['cap'], 'F', v['F'], 'Frek', v['Frek'], 'matches', v['matches'], '/', v['ids'], v['pruef'])
    json.dump(alle, open('verlauf.json', 'w'))
