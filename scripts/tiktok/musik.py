"""
Hintergrundmusik, selbst erzeugt (numpy, keine fremden Aufnahmen, keine Lizenzfragen): ruhiger, treibender Elektro-Teppich in A-Moll.
Der Aufbau richtet sich nach der Laenge des Films, nicht nach bestimmten Szenen: leise am Anfang, Puls und Bass kommen dazu, voll in der Mitte,
Ausklang zum Ende - so passt dieselbe Musik zum langen Film und zu jedem der kurzen TikTok-Teile. An den Szenengrenzen steht ein leises Rauschen.

  python musik.py                                    -> musik.wav fuer timeline.json
  python musik.py timeline-hoch-2.json musik-hoch-2.wav
"""
import json, sys, wave
from pathlib import Path
import numpy as np

HIER = Path(__file__).parent
SR = 44100
zeit = sys.argv[1] if len(sys.argv) > 1 else "timeline.json"
ziel = sys.argv[2] if len(sys.argv) > 2 else "musik.wav"
TL = json.loads((HIER / zeit).read_text(encoding="utf-8"))
ende = TL["gesamt"]
GESAMT = ende + 1.5
N = int(GESAMT * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(42)

BPM = 100
SCHLAG = 60 / BPM


def hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def huelle(zeiten, werte):
    return np.interp(t, zeiten, werte)


def frac(*xs):
    return [x * ende for x in xs]


lang = ende > 120
kurz_an = 0.04 if lang else 0.0  # beim kurzen Teil sofort Puls, damit schon die ersten Sekunden tragen
pad_lvl = huelle([0, 2] + frac(.1, .5, .9, 1.0) + [GESAMT], [0, .5, .55, .7, .6, .35, 0])
puls_lvl = huelle(frac(0, .06 + kurz_an, .12 + kurz_an, .25, .5, .72, .9, .96, 1.0), [0, 0, .35, .55, .8, 1.0, .8, .3, 0])
bass_lvl = huelle(frac(0, .1, .14, .6, .88, .94, 1.0) + [GESAMT], [0, 0, .7, 1.0, .8, 0, 0, 0])
ks = ende * (.1 if lang else .04)
kick_lvl = huelle([0, ks, ks + 4, ende * .4, ende * .7, ende * .9, ende * .96, GESAMT], [0, 0, .5, .75, .9, .6, 0, 0])

# --- Pad: Akkordfolge Am - F - C - G, je zwei Takte
akkorde = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]
takt = 4 * SCHLAG
laenge_akkord = 2 * takt
pad = np.zeros(N)
for i in range(int(GESAMT / laenge_akkord) + 1):
    a0 = i * laenge_akkord
    akk = akkorde[i % 4]
    i0, i1 = int(a0 * SR), min(N, int((a0 + laenge_akkord + 1.2) * SR))
    if i0 >= N:
        break
    tt = t[i0:i1] - a0
    env = np.minimum(1, tt / 1.4) * np.exp(-np.maximum(0, tt - laenge_akkord) * 2.2)
    sig = np.zeros(i1 - i0)
    for n in akk:
        f = hz(n + 12)
        for versatz in (-0.35, 0.0, 0.35):  # leicht verstimmt = breiter Klang
            sig += np.sin(2 * np.pi * (f + versatz) * tt) + .35 * np.sin(2 * np.pi * 2 * (f + versatz) * tt)
    pad[i0:i1] += sig * env / 14
k = 60
pad = np.convolve(pad, np.ones(k) / k, mode="same")

# --- Bass: Grundton je Akkord, Achtel-Pump
bass = np.zeros(N)
grund = [45, 41, 36, 43]
for i in range(int(GESAMT / laenge_akkord) + 1):
    a0 = i * laenge_akkord
    f = hz(grund[i % 4])
    for j in range(16):
        b0 = a0 + j * SCHLAG / 2
        if b0 >= GESAMT:
            break
        i0, i1 = int(b0 * SR), min(N, int((b0 + SCHLAG / 2) * SR))
        tt = t[i0:i1] - b0
        env = np.exp(-tt * 6) * (1 if j % 2 == 0 else .55)
        bass[i0:i1] += np.sin(2 * np.pi * f * tt) * env * .5 + np.sin(2 * np.pi * 2 * f * tt) * env * .12

# --- Puls: leise Arpeggio-Noten (Sechzehntel, Pentatonik) und Hi-Hat-Rauschen
puls = np.zeros(N)
skala = [69, 72, 74, 76, 79, 81]
for j in range(int(GESAMT / (SCHLAG / 4))):
    b0 = j * SCHLAG / 4
    i0, i1 = int(b0 * SR), min(N, int((b0 + .25) * SR))
    if i0 >= N:
        break
    tt = t[i0:i1] - b0
    n = skala[(j * 5 + (j // 8) * 2) % len(skala)]
    env = np.exp(-tt * 14)
    puls[i0:i1] += (np.sin(2 * np.pi * hz(n) * tt) + .4 * np.sin(2 * np.pi * 2 * hz(n) * tt)) * env * (.05 if j % 4 else .085)
    if j % 2 == 1:
        m = min(i1 - i0, int(.05 * SR))
        puls[i0:i0 + m] += rng.standard_normal(m) * np.exp(-np.arange(m) / (SR * .012)) * .035

# --- Kick auf jedem Schlag
kick = np.zeros(N)
for j in range(int(GESAMT / SCHLAG)):
    b0 = j * SCHLAG
    if b0 < ks:
        continue
    i0, i1 = int(b0 * SR), min(N, int((b0 + .35) * SR))
    if i0 >= N:
        break
    tt = t[i0:i1] - b0
    fr = 120 * np.exp(-tt * 22) + 42
    kick[i0:i1] += np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt * 9) * .8

# --- Uebergangs-Rauschen an den Szenengrenzen
whoosh = np.zeros(N)
for s in TL["szenen"][1:]:
    b = s["start"] - .15
    i0, i1 = int(max(0, b - .35) * SR), min(N, int((b + .45) * SR))
    tt = t[i0:i1] - (b - .35)
    rau = rng.standard_normal(i1 - i0)
    kk = 220
    rau = np.convolve(rau, np.ones(kk) / kk, mode="same") * 6
    env = np.sin(np.pi * np.clip(tt / .8, 0, 1)) ** 2
    whoosh[i0:i1] += rau * env * .22

mix = pad * pad_lvl * .9 + bass * bass_lvl * .55 + puls * puls_lvl + kick * kick_lvl * .55 + whoosh
verz = int(.012 * SR)
l = mix + np.roll(puls * puls_lvl, verz) * .4
r = mix + np.roll(puls * puls_lvl, -verz) * .4
fade = huelle([0, 1.2 if lang else .4, ende - 3.5, ende], [0, 1, 1, 0])
l, r = l * fade, r * fade
spitze = max(np.abs(l).max(), np.abs(r).max())
l, r = l / spitze * .85, r / spitze * .85
pcm = (np.stack([l, r], axis=1) * 32767).astype("<i2")
with wave.open(str(HIER / ziel), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(ziel, round(GESAMT, 1), "s")
