#!/usr/bin/env python3
"""Original-Audio fuer das Stats-Agent-Video (keine fremde Musik).

python3 ton.py sfx.json ausgabe.wav [--musik-db -5] [--lufs -16] [--stems]

- Elektronisches Bett, 125 BPM (Takt = 1,92 s, passt zum Szenen-Zeitplan in szene.html):
  Kick, Hats, Clap, Sub-Bass mit Sidechain, Pad-Akkorde (Am - F - C - G), Pluck-Arpeggio.
- SFX laut Zeitplan aus der Szene (window.SFX): whoosh, hit, impact, riser, glitch, click, blip, ping, ticks, stream.
- Mischung: Hall per FFT-Faltung, Soft-Clip, danach ffmpeg loudnorm (2 Durchgaenge) auf -16 LUFS / -1,5 dBTP.
- Musikbett standardmaessig 5 dB leiser als in der ersten Fassung (Betreiber, 15.11.2026: "Musik etwas zu laut");
  SFX unveraendert. --musik-db 0 ergibt die alte Balance.
- Abschnittszeiten (S2..S6, STEP0, STEP_END) kommen aus plan["abschnitte"], sonst die Werte des Stats-Agent-Videos.
- --stems schreibt zusaetzlich -musik.wav und -sfx.wav (gleiche Verstaerkung, ohne Saettigung) zum Nachmessen.
Nur numpy + ffmpeg.
"""
import json
import subprocess
import sys
import wave

import numpy as np

SR = 48000
BPM = 125.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)

def opt(name, std):
    return float(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else std


plan = json.load(open(sys.argv[1]))
AUS = sys.argv[2]
MUSIK_DB = opt("--musik-db", -5.0)  # Musikbett relativ zur ersten Fassung
ZIEL_LUFS = opt("--lufs", -16.0)
STEMS = "--stems" in sys.argv
DAUER = float(plan["dauer"])
N = int(round(DAUER * SR))
SFXL = plan["sfx"]

# Abschnitte: S2 Drop, S3 volle Drums, S4 Breakdown, S5 Wiedereinstieg Arp, S6 Outro; STEP0/STEP_END = Arp-Strecke
AB = {"S2": 5.76, "S3": 13.44, "S4": 71.04, "S5": 80.64, "S6": 86.40, "STEP0": 15.36, "STEP_END": 63.36}
AB.update(plan.get("abschnitte", {}))
S2, S3, S4, S5, S6 = AB["S2"], AB["S3"], AB["S4"], AB["S5"], AB["S6"]
STEP0, STEP_END = AB["STEP0"], AB["STEP_END"]


# ---------------------------------------------------------------- Hilfen
def zeit(n):
    return np.arange(n) / SR


def fft_filter(x, lo=None, hi=None, ordnung=2):
    """Butterworth-artiger Betragsfilter im Frequenzbereich (nullphasig)."""
    n = len(x)
    m = 1 << (n - 1).bit_length()
    X = np.fft.rfft(x, m)
    f = np.fft.rfftfreq(m, 1 / SR)
    h = np.ones_like(f)
    if hi:
        h *= 1 / np.sqrt(1 + (f / hi) ** (2 * ordnung))
    if lo:
        with np.errstate(divide="ignore"):
            h *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * ordnung))
    return np.fft.irfft(X * h, m)[:n]


def lege(bus, sig, t0, gain=1.0, pan=0.0):
    """Mono- oder Stereo-Signal an Zeitpunkt t0 in den Stereo-Bus legen."""
    i0 = int(round(t0 * SR))
    if sig.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l * np.sqrt(2), sig * r * np.sqrt(2)], 1)
    a, b = max(0, i0), min(N, i0 + len(sig))
    if b <= a:
        return
    bus[a:b] += sig[a - i0 : b - i0] * gain


def note(n):  # MIDI -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def saw(f, t, phase=0.0):
    # bandbegrenzt (additiv, bis 9 kHz)
    out = np.zeros_like(t)
    k = 1
    while k * f < 9000 and k <= 24:
        out += np.sin(2 * np.pi * k * f * t + phase * k) / k
        k += 1
    return out * 0.6


def hall(x, laenge=1.6, daempf=3.2, hi=5000):
    """Stereo-Hall per FFT-Faltung mit abklingendem Rauschen."""
    n = int(laenge * SR)
    tt = zeit(n)
    ir = []
    for s in (1, 2):
        r = np.random.default_rng(100 + s).standard_normal(n) * np.exp(-tt * daempf)
        r = fft_filter(r, lo=200, hi=hi)
        r[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        ir.append(r / np.sqrt(np.sum(r**2)))
    m = 1 << (len(x) + n - 1).bit_length()
    out = np.zeros_like(x)
    for c in range(2):
        y = np.fft.irfft(np.fft.rfft(x[:, c], m) * np.fft.rfft(ir[c], m), m)[: len(x)]
        out[:, c] = y
    return out


# ---------------------------------------------------------------- Instrumente
def kick():
    t = zeit(int(0.42 * SR))
    f = 46 + 120 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 6.5)
    s += 0.25 * np.sin(ph * 2) * np.exp(-t * 30)
    klick = fft_filter(rng.standard_normal(len(t)), lo=1500, hi=6000) * np.exp(-t * 400) * 0.35
    return np.tanh((s + klick) * 1.4) * 0.9


def hat(offen=False):
    t = zeit(int((0.22 if offen else 0.07) * SR))
    s = fft_filter(rng.standard_normal(len(t)), lo=7000, hi=15000, ordnung=3)
    return s * np.exp(-t * (22 if offen else 70)) * 0.5


def clap():
    t = zeit(int(0.35 * SR))
    nz = fft_filter(rng.standard_normal(len(t)), lo=900, hi=4200)
    env = np.exp(-t * 16)
    for d in (0.0, 0.011, 0.022):
        env += 0.8 * np.exp(-np.maximum(t - d, 0) * 180) * (t >= d)
    return nz * env * 0.32


def click(f=3800, laenge=0.035, g=0.5):
    t = zeit(int(laenge * SR))
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 160)
    s += fft_filter(rng.standard_normal(len(t)), lo=2500) * np.exp(-t * 900) * 0.5
    return s * g


def blip():
    t = zeit(int(0.22 * SR))
    f = np.where(t < 0.06, 1320, 1760)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18) * np.minimum(1, t / 0.003)
    return s * 0.28


def ping():
    t = zeit(int(0.9 * SR))
    s = (np.sin(2 * np.pi * 1568 * t) + 0.5 * np.sin(2 * np.pi * 2349 * t) + 0.2 * np.sin(2 * np.pi * 3136 * t)) * np.exp(-t * 6)
    return s * np.minimum(1, t / 0.002) * 0.17


def whoosh(laenge=0.8):
    t = zeit(int(laenge * SR))
    nz = rng.standard_normal(len(t))
    s = np.zeros_like(t)
    baender = [(250, 600), (500, 1200), (1000, 2500), (2000, 5000), (4000, 10000)]
    for i, (lo, hi) in enumerate(baender):
        mitte = 0.2 + 0.035 * i
        s += fft_filter(nz, lo=lo, hi=hi) * np.exp(-((t - mitte) / 0.11) ** 2) * (1 - 0.1 * i)
    pan = np.clip((t - 0.1) / 0.45, 0, 1) * 1.6 - 0.8
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([s * l, s * r], 1) * 0.55


def hit():
    t = zeit(int(1.4 * SR))
    f = 38 + 60 * np.exp(-t * 12)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    s += fft_filter(rng.standard_normal(len(t)), lo=80, hi=2500) * np.exp(-t * 14) * 0.5
    return np.tanh(s * 1.3) * 0.75


def impact():
    t = zeit(int(3.2 * SR))
    f = 30 + 70 * np.exp(-t * 5)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.4)
    crash = fft_filter(rng.standard_normal(len(t)), lo=2500, hi=14000) * np.exp(-t * 2.2) * 0.35
    koerper = fft_filter(rng.standard_normal(len(t)), lo=60, hi=1200) * np.exp(-t * 8) * 0.6
    ton = sum(np.sin(2 * np.pi * note(n) * t) for n in (45, 52, 57, 64)) * np.exp(-t * 1.1) * 0.08
    return np.tanh((sub + crash + koerper + ton) * 1.2) * 0.85


def riser(d):
    t = zeit(int(d * SR))
    q = t / d
    nz = rng.standard_normal(len(t))
    s = np.zeros_like(t)
    for i, (lo, hi) in enumerate([(300, 900), (800, 2500), (2000, 6000), (5000, 12000)]):
        mitte = 0.25 + 0.25 * i
        s += fft_filter(nz, lo=lo, hi=hi) * np.exp(-((q - mitte) / 0.3) ** 2)
    f = 180 + 700 * q**2
    s += 0.25 * np.sin(2 * np.pi * np.cumsum(f) / SR)
    return s * (q**2.2) * 0.45


def glitch():
    t = zeit(int(0.55 * SR))
    s = np.zeros_like(t)
    seg = int(0.028 * SR)
    for k in range(0, len(t), seg):
        f = 180 + rng.random() * 1600
        tt = t[k : k + seg] - t[k]
        if rng.random() < 0.75:
            s[k : k + seg] = np.sign(np.sin(2 * np.pi * f * tt)) * (0.5 + 0.5 * rng.random())
    s = np.round(s * 4) / 4  # grob quantisiert
    s += fft_filter(rng.standard_normal(len(t)), lo=1000) * 0.3
    s *= np.exp(-t * 3) * 0.22
    # tiefer "Abschalt"-Ton
    f2 = 220 * np.exp(-t * 4)
    s += np.sin(2 * np.pi * np.cumsum(f2) / SR) * np.exp(-t * 4) * 0.25
    return s


def ticks(d):
    """Klicks im Takt eines Zaehlers mit Exponential-Verlauf (wie zaehle() in der Szene)."""
    out = np.zeros(int((d + 0.1) * SR))
    t = zeit(len(out))
    p = 1 - 2 ** (-10 * np.clip(t / d, 0, 1))
    stufe = np.floor(p * 36)
    idx = np.nonzero(np.diff(stufe) > 0)[0]
    c = click(4200, 0.02, 0.22)
    for i in idx:
        out[i : i + len(c)] += c[: len(out) - i]
    return out


def stream(d):
    out = np.zeros(int((d + 0.1) * SR))
    t = zeit(len(out))
    for k in range(int(d * 28)):
        z = rng.random() * d
        f = rng.choice([1200, 1600, 2000, 2400, 3200])
        n = int(0.018 * SR)
        tt = zeit(n)
        i = int(z * SR)
        out[i : i + n] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 200) * 0.1
    env = np.minimum(1, t / 0.3) * np.minimum(1, (d - t + 0.1) / 0.4).clip(0, 1)
    return out * env


# ---------------------------------------------------------------- Musik
musik = np.zeros((N, 2))
drums = np.zeros((N, 2))
K, HC, HO, CL = kick(), hat(), hat(True), clap()

# Kick-Zeitpunkte
kicks = []
b = 0
while b * BEAT < DAUER:
    t = b * BEAT
    an = (S2 <= t < S6 - BAR / 2) or (S6 + BAR * 2 <= t < DAUER - BAR)
    if S4 <= t < S4 + BAR:  # kurze Luft am Anfang von "Always online"
        an = b % 2 == 0
    if an:
        kicks.append(t)
        lege(drums, K, t, 0.8 if t < S6 else 0.55)
    b += 1
# Fill vor dem Outro: Kicks auf Achteln
t = S6 - BAR / 2
while t < S6 - 0.01:
    lege(drums, K, t, 0.6)
    t += BEAT / 2

# Hats
s = 0
while s * BEAT / 4 < DAUER:
    t = s * BEAT / 4
    pos = s % 4
    if 2.88 <= t < S6 - 0.1 or S6 + BAR <= t < DAUER - BAR:
        voll = S2 <= t < S6
        if pos == 2:
            lege(drums, HO if voll else HC, t, 0.55 if voll else 0.35, pan=0.25)
        elif voll and S3 <= t:
            lege(drums, HC, t, 0.16 + 0.06 * (pos == 0) + 0.02 * rng.random(), pan=-0.3)
    s += 1
# Clap auf 2 und 4
b = 0
while b * BEAT < DAUER:
    t = b * BEAT
    if b % 4 in (1, 3) and S3 <= t < S6:
        lege(drums, CL, t, 0.7, pan=0.05)
    b += 1
# Snare-Roll vor dem Outro
rollstart = S6 - BAR
for k in range(32):
    t = rollstart + k * BAR / 32
    lege(drums, CL, t, 0.12 + 0.5 * (k / 32) ** 2, pan=0.0)

# Sidechain-Huellkurve
tt = zeit(N)
duck = np.ones(N)
for t0 in kicks:
    i0 = int(t0 * SR)
    n = int(0.35 * SR)
    seg = 1 - 0.75 * np.exp(-zeit(n) * 11)
    a, b2 = i0, min(N, i0 + n)
    duck[a:b2] = np.minimum(duck[a:b2], seg[: b2 - a])

# Akkorde: Am - F - C - G, je 2 Takte
AKK = [(57, [57, 60, 64, 67]), (53, [53, 57, 60, 64]), (48, [55, 60, 64, 67]), (55, [55, 59, 62, 67])]
pad = np.zeros((N, 2))
bass = np.zeros(N)
arp = np.zeros((N, 2))
seglen = 2 * BAR
k = 0
while k * seglen < DAUER:
    t0 = k * seglen
    wurzel, toene = AKK[k % 4]
    n = int((seglen + 0.6) * SR)
    t = zeit(n)
    env = np.minimum(1, t / 0.35) * np.clip((seglen + 0.6 - t) / 0.6, 0, 1)
    for c, det in ((0, -1), (1, 1)):
        x = np.zeros(n)
        for tn in toene:
            f = note(tn)
            x += saw(f * 2 ** (det * 7 / 1200), t, phase=c * 1.3 + tn) + saw(f * 2 ** (-det * 4 / 1200), t, phase=tn * 0.7)
        x = fft_filter(x, hi=1400 + 500 * np.sin(k * 1.7) ** 2)
        lege(pad, np.stack([x * (c == 0), x * (c == 1)], 1) * env[:, None] * 0.045, t0)
    # Sub-Bass (Grundton, eine Oktave tiefer)
    fb = note(wurzel - 24 if wurzel > 50 else wurzel - 12)
    sb = np.sin(2 * np.pi * fb * t) + 0.18 * np.sin(4 * np.pi * fb * t)
    benv = np.minimum(1, t / 0.02) * np.clip((seglen - t) / 0.05, 0, 1)
    i0 = int(t0 * SR)
    a, b2 = i0, min(N, i0 + n)
    bass[a:b2] += (sb * benv)[: b2 - a]
    # Arpeggio (16tel)
    for j in range(32):
        ta = t0 + j * BEAT / 2 / 2 * 2  # 8tel
        if j >= 16:
            break
        tn = toene[[0, 2, 1, 3, 2, 1, 3, 2][j % 8]] + 12
        nn = int(0.3 * SR)
        tq = zeit(nn)
        f = note(tn)
        x = (np.sin(2 * np.pi * f * tq) + 0.35 * np.sin(4 * np.pi * f * tq) + 0.1 * np.sin(6 * np.pi * f * tq)) * np.exp(-tq * 14) * np.minimum(1, tq / 0.002)
        lege(arp, x * 0.075, ta, pan=-0.35 if j % 2 else 0.35)
    k += 1

# Abschnitts-Lautstaerken
def kurve(punkte):
    xs, ys = zip(*punkte)
    return np.interp(tt, xs, ys)

pad_g = kurve([(0, 0), (2.0, 0.7), (S2, 0.8), (S2 + 0.1, 0.65), (S4, 0.65), (S4 + 1, 0.85), (S5, 0.7), (S6, 1.0), (DAUER - 3.0, 0.9), (DAUER, 0)])
bass_g = kurve([(0, 0), (S2 - 0.05, 0), (S2, 0.32), (S6 - 0.05, 0.32), (S6, 0.36), (DAUER - 3.0, 0.3), (DAUER, 0)])
arp_g = kurve([(0, 0), (STEP0 - 0.1, 0), (STEP0 + 1, 1), (STEP_END, 1), (STEP_END + 1, 0.4), (S4, 0.0), (S5, 0.0), (S5 + 0.5, 0.7), (S6, 0.6), (S6 + 4, 0.4), (DAUER - 2, 0), (DAUER, 0)])
drum_g = kurve([(0, 0.6), (S2, 1), (DAUER - 3.0, 1), (DAUER - 1.0, 0), (DAUER, 0)])

bass = np.tanh(bass * 1.2)
musik += pad * pad_g[:, None]
musik += np.stack([bass, bass], 1) * (bass_g * duck)[:, None]
arp_h = arp + hall(arp, 1.2, 4.0) * 0.35
# Ping-Pong-Delay (3/8 Takt)
dl = int(0.75 * BEAT * SR)
arp_d = np.zeros_like(arp_h)
arp_d[dl:, 0] += arp_h[:-dl, 1] * 0.35
arp_d[2 * dl :, 1] += arp_h[: -2 * dl, 0] * 0.2
musik += (arp_h + arp_d) * (arp_g * (0.5 + 0.5 * duck))[:, None]
musik = musik * (0.75 + 0.25 * duck)[:, None]
musik += hall(pad * pad_g[:, None], 2.2, 2.2) * 0.25
musik += drums * drum_g[:, None]

# ---------------------------------------------------------------- SFX
sfx = np.zeros((N, 2))
for e in SFXL:
    t, k, v = e["t"], e["k"], e.get("v", 1.0)
    if k == "whoosh":
        lege(sfx, whoosh(), t - 0.22, 0.75 * v)
    elif k == "hit":
        lege(sfx, hit(), t, 0.8 * v)
    elif k == "impact":
        lege(sfx, impact(), t, 1.0 * v)
    elif k == "riser":
        d = e.get("d", 2.0)
        lege(sfx, riser(d), t, 0.6 * v)
    elif k == "glitch":
        lege(sfx, glitch(), t, 0.9 * v)
    elif k == "click":
        lege(sfx, click(), t, 0.5 * v, pan=rng.uniform(-0.3, 0.3))
    elif k == "blip":
        lege(sfx, blip(), t, 0.7 * v)
    elif k == "ping":
        lege(sfx, ping(), t, 0.9 * v)
    elif k == "ticks":
        lege(sfx, ticks(e.get("d", 1.0)), t, 0.9 * v)
    elif k == "stream":
        lege(sfx, stream(e.get("d", 2.0)), t, 0.8 * v, pan=0.15)
sfx = sfx + hall(sfx, 1.4, 3.5) * 0.22

# ---------------------------------------------------------------- Master
MG = 0.85 * 10 ** (MUSIK_DB / 20)
mix = musik * MG + sfx * 0.9
mix = fft_filter(mix[:, 0], lo=25, ordnung=2)[:, None] * [1, 0] + fft_filter(mix[:, 1], lo=25, ordnung=2)[:, None] * [0, 1]
norm = np.max(np.abs(mix)) + 1e-9
mix /= norm
mix = np.tanh(mix * 1.6) / np.tanh(1.6)  # sanfte Saettigung
fade_in = np.minimum(1, tt / 0.4)
fade_out = np.clip((DAUER - tt) / 2.4, 0, 1) ** 1.5
mix *= (fade_in * fade_out)[:, None]
mix *= 0.89 / (np.max(np.abs(mix)) + 1e-9)


def schreibe(pfad, x):
    d = (x + rng.uniform(-0.5, 0.5, x.shape) / 32768) * 32767
    d = np.clip(d, -32768, 32767).astype("<i2")
    with wave.open(pfad, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(d.tobytes())


roh = AUS.replace(".wav", "-roh.wav")
schreibe(roh, mix)
if STEMS:
    for name, x in (("musik", musik * MG), ("sfx", sfx * 0.9)):
        y = fft_filter(x[:, 0], lo=25)[:, None] * [1, 0] + fft_filter(x[:, 1], lo=25)[:, None] * [0, 1]
        schreibe(AUS.replace(".wav", f"-{name}.wav"), np.clip(y / norm * 0.5, -1, 1))

# Lautheit: 2-Durchgang-loudnorm auf ZIEL_LUFS, True Peak -1.5 dBTP
mess = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", roh, "-af", f"loudnorm=I={ZIEL_LUFS}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
j = json.loads(mess[mess.rindex("{") : mess.rindex("}") + 1])
af = (f"loudnorm=I={ZIEL_LUFS}:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
      f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true,alimiter=limit=0.84:attack=1:release=50:level=false")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", roh, "-af", af, "-ar", str(SR), "-c:a", "pcm_s16le", AUS], check=True)
print("Audio:", AUS, f"{DAUER:.2f} s", f"Musik {MUSIK_DB:+.1f} dB, Ziel {ZIEL_LUFS} LUFS,", "gemessen vorher:", j["input_i"], "LUFS")
