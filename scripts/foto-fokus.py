# Wo im Foto das Gesicht sitzt - fuer jeden Spieler (Betreiber, 14.10.2026: "du musst gucken, dass jeder immer mittig ist ... man erkennt die Person
# fast gar nicht, der Kopf ist abgeschnitten").
#
# Fotos sind unterschiedlich geschnitten: bei dem einen sitzt das Gesicht oben, beim anderen in der Mitte. Wo ein Foto in einen Rahmen mit anderem
# Seitenverhaeltnis kommt (Kacheln, Karten), schneidet der Browser es aus - und bisher immer von oben. Hier wird je Foto der Mittelpunkt des Gesichts
# gesucht (OpenCV, Gesichtserkennung mit den mitgelieferten Mustern - kostenlos, laeuft lokal); die Seite richtet den Ausschnitt danach aus
# (lib/fotoFokus.ts, "object-position"). Wo kein Gesicht gefunden wird (Seitenansicht, Kopfhoerer, Maske), gilt eine Voreinstellung: waagrecht Mitte,
# senkrecht im oberen Drittel.
#
#   python scripts/foto-fokus.py            schreibt lib/fotoFokus.json
#
# Aufruf bei jedem neuen Spielerfoto wiederholen (nach scripts/spielerbilder-klein.mjs).

import json
import os
import sys

import cv2

ORDNER = os.path.join(os.path.dirname(__file__), '..', 'public', 'spielerbilder-klein')
AUS = os.path.join(os.path.dirname(__file__), '..', 'lib', 'fotoFokus.json')

muster = [
    cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, n))
    for n in ('haarcascade_frontalface_default.xml', 'haarcascade_frontalface_alt2.xml', 'haarcascade_profileface.xml')
]


def gesicht(bild):
    """(mitte_x, mitte_y, breite) in Anteilen des Bildes, oder None."""
    grau = cv2.cvtColor(bild, cv2.COLOR_BGR2GRAY)
    grau = cv2.equalizeHist(grau)
    h, b = grau.shape
    klein = int(min(b, h) * 0.12)
    funde = []
    for i, m in enumerate(muster):
        bilder = [grau] if i < 2 else [grau, cv2.flip(grau, 1)]
        for k, g in enumerate(bilder):
            for (x, y, w, hh) in m.detectMultiScale(g, scaleFactor=1.08, minNeighbors=4, minSize=(klein, klein)):
                if k == 1:  # gespiegelt: zurueckrechnen
                    x = b - x - w
                funde.append((x, y, w, hh))
        if funde and i < 2:
            break
    if not funde:
        return None
    # Das groesste Gesicht, das nicht ganz am Rand liegt.
    funde.sort(key=lambda f: f[2] * f[3], reverse=True)
    x, y, w, hh = funde[0]
    mx, my, breite = (x + w / 2) / b, (y + hh / 2) / h, w / b
    # Ein Gesicht in der unteren Haelfte oder winzig ist meist ein Mikrofon oder ein Logo auf dem Trikot - dann gilt die Voreinstellung.
    if my > 0.5 or breite < 0.12:
        return None
    return (mx, my, breite)


ergebnis = {}
gefunden = 0
dateien = sorted(f for f in os.listdir(ORDNER) if f.lower().endswith(('.webp', '.png', '.jpg', '.jpeg')))
for name in dateien:
    bild = cv2.imread(os.path.join(ORDNER, name))
    if bild is None:
        continue
    g = gesicht(bild)
    if g:
        gefunden += 1
        fx, fy, _ = g
        # Der Mittelpunkt des Gesichts; fuer den Ausschnitt liegt der Kopf etwas hoeher als die Gesichtsmitte (Haare, Stirn).
        ergebnis[name] = [round(fx * 100), round(max(8, min(60, fy * 100 - 2)))]
    else:
        ergebnis[name] = [50, 28]

with open(AUS, 'w', encoding='utf-8') as f:
    json.dump(ergebnis, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
print(f'{len(dateien)} Fotos, bei {gefunden} ein Gesicht gefunden, der Rest mit Voreinstellung -> {os.path.normpath(AUS)}')
sys.exit(0)
