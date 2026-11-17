# Zuschnitte fuer den Foto-Pool (Betreiber, 17.11.2026): der Betreiber schickt viele Spielerfotos ohne Namen; wir schneiden sie zu, er ordnet sie
# auf der Seite zu (/admin/fotos-pool). Aufgerufen von scripts/fotos-pool-import.mjs - nicht von Hand noetig.
#
# Gesichter werden NUR gesucht, um den Ausschnitt zu legen - nie, um jemanden zu erkennen. Es gibt keinen Vergleich mit anderen Fotos, keine
# Merkmale, keine Namen; die Kaesten werden nach dem Zuschnitt verworfen.
#
# Format wie scripts/foto-zuschneiden.py (die Zuschnitte des Betreibers, an 31 gemessen): Hochformat 4:5, Gesicht waagrecht mittig, Gesichtsmitte
# bei 36 % der Hoehe, Gesicht 45 % so breit wie das Bild; der Kopf (samt Haaren und Kinn) bleibt immer ganz drin.
#
# Mehrere Personen im Foto (Betreiber, 17.11.2026): je Person ein eigener Zuschnitt, auf dem NUR sie zu sehen ist - kein anderes Gesicht, auch kein
# halbes. Dafuer wird der Ausschnitt verkleinert und verschoben; geht es nicht sauber (Gesichter zu nah beieinander), wird diese Person
# uebersprungen und der Grund gemeldet.
#
# Erkennung: YuNet (OpenCV FaceDetectorYN, scripts/modelle/face_detection_yunet_2023mar.onnx, MIT-Lizenz, opencv_zoo) - findet auch kleine und
# schraege Gesichter im Hintergrund, die ja ebenfalls nicht im Bild sein duerfen. Fehlt das Modell, die Haar-Muster wie foto-zuschneiden.py.
#
#   python scripts/fotos-pool-gesichter.py BILD [...]           -> JSON auf stdout: je Bild { datei, breite, hoehe, gesichter, zuschnitte, uebersprungen }
#   --ohne-gesicht                                              Fotos ohne Gesicht trotzdem zuschneiden (Mitte, oben buendig) statt sie zu melden

import json
import os
import sys

import cv2
import numpy as np

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

MITTE_X, MITTE_Y, BREITE = 0.50, 0.36, 0.45
SEITE = 0.8  # Breite / Hoehe (4:5)
MIN_BREITE = 160  # kleiner als das ist der Zuschnitt zu unscharf fuer ein Profilfoto
MODELL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'modelle', 'face_detection_yunet_2023mar.onnx')
ERKENNUNG_MAX = 1600  # fuer die Suche verkleinern (YuNet ist bei 6000-px-Fotos langsam); die Kaesten werden zurueckgerechnet

_yunet = None
if os.path.exists(MODELL):
    try:
        _yunet = cv2.FaceDetectorYN.create(MODELL, '', (320, 320), 0.6, 0.3, 5000)
    except Exception:
        _yunet = None
_haar = [cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, n))
         for n in ('haarcascade_frontalface_default.xml', 'haarcascade_frontalface_alt2.xml', 'haarcascade_profileface.xml')]


def lies(pfad):
    try:
        return cv2.imdecode(np.fromfile(pfad, dtype=np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        return None


def doppelt(a, b):
    ax, ay = a[0] + a[2] / 2, a[1] + a[3] / 2
    bx, by = b[0] + b[2] / 2, b[1] + b[3] / 2
    return abs(ax - bx) < max(a[2], b[2]) * 0.5 and abs(ay - by) < max(a[3], b[3]) * 0.5


def gesichter(bild):
    """Alle Gesichter als (x, y, w, h) in Pixeln des Originals."""
    h, b = bild.shape[:2]
    f = min(1.0, ERKENNUNG_MAX / max(b, h))
    klein = cv2.resize(bild, (max(1, int(b * f)), max(1, int(h * f))), interpolation=cv2.INTER_AREA) if f < 1 else bild
    kh, kb = klein.shape[:2]
    funde = []
    if _yunet is not None:
        _yunet.setInputSize((kb, kh))
        _, roh = _yunet.detect(klein)
        for z in (roh if roh is not None else []):
            x, y, w, hh = (float(v) / f for v in z[:4])
            if w > 4 and hh > 4:
                funde.append((x, y, w, hh))
    else:
        grau = cv2.equalizeHist(cv2.cvtColor(klein, cv2.COLOR_BGR2GRAY))
        mini = max(16, int(min(kb, kh) * 0.03))
        for i, m in enumerate(_haar):
            bilder = [grau] if i < 2 else [grau, cv2.flip(grau, 1)]
            for k, g in enumerate(bilder):
                for (x, y, w, hh) in m.detectMultiScale(g, scaleFactor=1.06, minNeighbors=6, minSize=(mini, mini)):
                    if k == 1:
                        x = kb - x - w
                    funde.append((x / f, y / f, w / f, hh / f))
    einzeln = []
    for g in sorted(funde, key=lambda g: -g[2] * g[3]):
        if not any(doppelt(g, e) for e in einzeln):
            einzeln.append(g)
    return einzeln


def kopf(g):
    """Der Kopf samt Haaren, Kinn und etwas Luft - muss ganz im Zuschnitt liegen."""
    x, y, w, hh = g
    return x - w * 0.25, y - hh * 0.7, x + w * 1.25, y + hh * 1.25


def sperre(g):
    """Die Flaeche eines ANDEREN Gesichts, die nicht einmal angeschnitten im Zuschnitt liegen darf (Gesicht mit Haaren, Ohren, Kappe)."""
    x, y, w, hh = g
    return x - w * 0.35, y - hh * 0.6, x + w * 1.35, y + hh * 1.2


def schneidet(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def zuschnitt(b, h, g, andere):
    """Der beste 4:5-Ausschnitt (x, y, breite, hoehe) fuer Gesicht g, in dem kein anderes Gesicht liegt - oder (None, grund)."""
    x, y, w, hh = g
    fx, fy = x + w / 2, y + hh / 2
    k = kopf(g)
    grenze = min(b, h * SEITE)
    ideal = min(max(w / BREITE, grenze * 0.5 if not andere else 0), grenze)
    # Kleinster sinnvoller Ausschnitt: der Kopf passt gerade hinein.
    kleinst = max(k[2] - k[0], (k[3] - k[1]) * SEITE)
    if kleinst > grenze + 1:
        kleinst = grenze
    sperren = [sperre(a) for a in andere]
    # Groessen vom Ideal aus: erst groesser (der Kopf soll ganz hinein), dann kleiner (die Nachbarn sollen hinaus).
    groessen = []
    s = ideal
    while s < grenze:
        groessen.append(s)
        s *= 1.06
    groessen.append(grenze)
    s = ideal / 1.06
    while s >= kleinst * 0.999:
        groessen.append(s)
        s /= 1.06
    best = None
    for cb in groessen:
        ch = cb / SEITE
        if cb > b + 0.5 or ch > h + 0.5:
            continue
        # Alle Lagen, in denen der Kopf ganz drin ist (soweit das Foto ihn zeigt).
        x_von, x_bis = max(0, min(b, k[2]) - cb), min(b - cb, max(0, k[0]))
        y_von, y_bis = max(0, min(h, k[3]) - ch), min(h - ch, max(0, k[1]))
        if x_von > x_bis + 0.5 or y_von > y_bis + 0.5:
            continue
        ix = min(max(fx - cb * MITTE_X, x_von), x_bis)
        iy = min(max(fy - ch * MITTE_Y, y_von), y_bis)
        schritte = 24
        for dx in sorted(set([0] + [i / schritte for i in range(-schritte, schritte + 1)]), key=abs):
            cx = min(max(ix + dx * (x_bis - x_von), x_von), x_bis)
            for dy in (0, -0.25, 0.25, -0.5, 0.5, -1, 1):
                cy = min(max(iy + dy * (y_bis - y_von), y_von), y_bis)
                kasten = (cx, cy, cx + cb, cy + ch)
                if any(schneidet(kasten, s) for s in sperren):
                    continue
                # Abweichung vom Vorbild: Groesse zaehlt doppelt, Lage einfach.
                fehler = 2 * abs(cb - ideal) / ideal + abs(cx - (fx - cb * MITTE_X)) / cb + abs(cy - (fy - ch * MITTE_Y)) / ch
                if best is None or fehler < best[0]:
                    best = (fehler, (int(round(cx)), int(round(cy)), int(cb), int(ch)))
                break
        if best is not None and cb >= ideal * 0.999:
            break  # ein Ausschnitt in Idealgroesse (oder groesser) reicht - kleinere wuerden nur schlechter
    if best is None:
        return None, 'andere Gesichter zu nah - kein Ausschnitt nur mit dieser Person moeglich'
    cx, cy, cb, ch = best[1]
    if cb < MIN_BREITE:
        return None, f'zu klein ({cb}x{ch} Pixel)'
    return best[1], None


def bearbeite(pfad, ohne_gesicht):
    bild = lies(pfad)
    if bild is None:
        return {'datei': pfad, 'fehler': 'nicht lesbar'}
    h, b = bild.shape[:2]
    alle = gesichter(bild)
    aus = {'datei': pfad, 'breite': b, 'hoehe': h, 'gesichter': len(alle), 'zuschnitte': [], 'uebersprungen': [],
           'erkennung': 'yunet' if _yunet is not None else 'haar'}
    if not alle:
        if ohne_gesicht:
            cb = int(min(b, h * SEITE))
            aus['zuschnitte'].append({'x': (b - cb) // 2, 'y': 0, 'breite': cb, 'hoehe': int(cb / SEITE), 'ohneGesicht': True})
        else:
            aus['uebersprungen'].append({'grund': 'kein Gesicht erkannt'})
        return aus
    groesstes = alle[0][2]
    for i, g in enumerate(alle):
        # Wer deutlich kleiner ist als das groesste Gesicht, steht im Hintergrund: kein eigener Zuschnitt, aber auch nicht im Bild der anderen.
        if g[2] < groesstes * 0.4:
            continue
        andere = [a for j, a in enumerate(alle) if j != i]
        kasten, grund = zuschnitt(b, h, g, andere)
        lage = {'gesicht': [int(g[0]), int(g[1]), int(g[2]), int(g[3])]}
        if kasten is None:
            aus['uebersprungen'].append({**lage, 'grund': grund})
        else:
            aus['zuschnitte'].append({**lage, 'x': kasten[0], 'y': kasten[1], 'breite': kasten[2], 'hoehe': kasten[3]})
    hinten = sum(1 for g in alle if g[2] < groesstes * 0.4)
    if hinten:
        aus['hintergrund'] = hinten
    return aus


if __name__ == '__main__':
    args = sys.argv[1:]
    ohne = '--ohne-gesicht' in args
    dateien = [a for a in args if not a.startswith('--')]
    print(json.dumps([bearbeite(d, ohne) for d in dateien], ensure_ascii=False))
