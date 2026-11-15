import json, math, datetime, sys
exec(open('prod.py').read().split("if __name__")[0])
K = json.load(open('kurven.json'))
kv = [tuple(x) for x in K['lobby']['kurve']]; sv = [tuple(x) for x in K['lobby']['streu']]
name = sys.argv[1] if len(sys.argv) > 1 else 'S43_FNCSSoloReload_HeatsStage_Heat2_EU'
P = int(sys.argv[2]) if len(sys.argv) > 2 else 228
v = [x for x in json.load(open('verlauf2.json')) if x['w'] == name][0]
cap = v['cap']; lock = None
uhr = lambda t: datetime.datetime.fromtimestamp(t, datetime.UTC).strftime('%H:%M:%S')
zs = v['z']
for i, z in enumerate(zs):
    p, w = vorhersage(z['L'], z['e'], cap, P, kv, sv, fertig=z['e'] >= cap)
    if lock is None and z['k'] >= math.ceil(cap * .6) and z['k'] < cap:
        hoch = round(z['L'] * cap / z['k']); lock = hoch if abs(hoch - P) > P * .03 else P
        print(f"  {uhr(z['t'])} heutige Sperre greift: gespielt={z['k']} Grenze={z['L']} -> mitte={lock} | neu {p:.0f}")
    nxt = zs[i + 1] if i + 1 < len(zs) else None
    if nxt is None or nxt['g'] != z['g'] or nxt['k'] != z['k']:
        print(f"{uhr(z['t'])} fertige Spiele {z['g']} gespielt(Seite) {z['k']} e {z['e']:.2f} Grenze {z['L']:>4} | heute {lock if lock else P:>4} | neu {p:5.0f} (Live-Gewicht {w:.2f})")
