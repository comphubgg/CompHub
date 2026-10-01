"""
Wo steht das Gesicht im Spielerfoto? - einmal rechnen, im Banner nur nachschlagen.

Der Betreiber (1.10.2026) zum Trio-Banner: "man erkennt ja die Spieler gar nicht ...
zuschneiden, immer so, dass der Kopf mittig ist und man ihn erkennt." Die Fotos
sind verschieden: Kopfbilder, Halbfiguren, ganze Figuren mit Pokal. Ein fester
Ausschnitt ("oben mittig") trifft nur manche. Deshalb sucht dieses Skript in jedem
Foto das Gesicht und schreibt seine Lage in public/spielerbilder/_gesichter.json:

    { "dateiname.jpg": [mitte_x, mitte_y, hoehe] }

alles als Anteil der Bildbreite beziehungsweise Bildhoehe (0 bis 1). Das Banner
schneidet damit so zu, dass das Gesicht in der Mitte des Rahmens sitzt.

Erkannt wird mit MediaPipe (Vollbereichs-Modell, laeuft lokal, kostenlos, ohne
Schluessel); findet es nichts, versucht OpenCV es mit seinem Haar-Erkenner. Fotos
ohne Treffer fehlen in der Datei - das Banner nimmt dann einen Standardausschnitt
und der Fehlbetrag steht in der Ausgabe.

Aufruf (im Projektordner):
    python scripts/gesichter-erkennen.py            # nur neue und geaenderte Fotos
    python scripts/gesichter-erkennen.py --alle     # alles neu
    python scripts/gesichter-erkennen.py --pruefbild OUT.png name1.jpg name2.png ...
"""
import json
import os
import sys

import cv2
import mediapipe as mp

ORDNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'spielerbilder')
ORDNER = os.path.normpath(ORDNER)
DATEI = os.path.join(ORDNER, '_gesichter.json')
ENDUNGEN = ('.jpg', '.jpeg', '.png', '.webp')


def lies(pfad):
    # cv2.imread kommt mit Umlauten in Windows-Pfaden nicht zurecht; ueber Bytes ist es sicher.
    import numpy as np
    daten = np.fromfile(pfad, dtype='uint8')
    bild = cv2.imdecode(daten, cv2.IMREAD_UNCHANGED)
    if bild is None:
        return None
    if bild.ndim == 3 and bild.shape[2] == 4:  # Transparenz auf Grau legen
        a = bild[:, :, 3:4] / 255.0
        bild = (bild[:, :, :3] * a + 128 * (1 - a)).astype('uint8')
    elif bild.ndim == 2:
        bild = cv2.cvtColor(bild, cv2.COLOR_GRAY2BGR)
    return bild


_mp = mp.solutions.face_detection
_voll = _mp.FaceDetection(model_selection=1, min_detection_confidence=0.35)
_nah = _mp.FaceDetection(model_selection=0, min_detection_confidence=0.35)
_haar = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml')


def gesicht(bild):
    h, b = bild.shape[:2]
    rgb = cv2.cvtColor(bild, cv2.COLOR_BGR2RGB)
    treffer = []
    for erkenner in (_voll, _nah):
        erg = erkenner.process(rgb)
        for d in (erg.detections or []):
            k = d.location_data.relative_bounding_box
            treffer.append((d.score[0] * k.width * k.height, k.xmin + k.width / 2, k.ymin + k.height / 2, k.height))
        if treffer:
            break
    if not treffer:
        grau = cv2.cvtColor(bild, cv2.COLOR_BGR2GRAY)
        for (x, y, fb, fh) in _haar.detectMultiScale(grau, 1.1, 5, minSize=(max(24, b // 25), max(24, h // 25))):
            treffer.append((fb * fh / (b * h), (x + fb / 2) / b, (y + fh / 2) / h, fh / h))
    if not treffer:
        return None
    # Das groesste und sicherste Gesicht - bei Gruppenfotos ist das meist der Spieler.
    _, cx, cy, fh = max(treffer)
    return [round(min(max(cx, 0), 1), 3), round(min(max(cy, 0), 1), 3), round(min(max(fh, 0.02), 1), 3)]


def pruefbild(ziel, namen, daten):
    """Eine Reihe Fotos mit eingezeichnetem Gesicht und dem Ausschnitt, den das Banner nimmt."""
    import numpy as np
    kacheln = []
    for n in namen:
        b = lies(os.path.join(ORDNER, n))
        if b is None:
            continue
        h, w = b.shape[:2]
        g = daten.get(n)
        if g:
            cx, cy, fh = g
            cv2.rectangle(b, (int((cx - fh * h / w / 2) * w), int((cy - fh / 2) * h)),
                          (int((cx + fh * h / w / 2) * w), int((cy + fh / 2) * h)), (0, 255, 0), max(2, h // 150))
        kacheln.append(cv2.resize(b, (int(w * 360 / h), 360)))
    breite = sum(k.shape[1] for k in kacheln)
    leinwand = np.zeros((360, breite, 3), dtype='uint8')
    x = 0
    for k in kacheln:
        leinwand[:, x:x + k.shape[1]] = k
        x += k.shape[1]
    cv2.imencode('.png', leinwand)[1].tofile(ziel)


def main():
    daten = {}
    if os.path.exists(DATEI):
        with open(DATEI, encoding='utf8') as f:
            daten = json.load(f)
    if '--pruefbild' in sys.argv:
        i = sys.argv.index('--pruefbild')
        pruefbild(sys.argv[i + 1], sys.argv[i + 2:], daten)
        return
    alle = '--alle' in sys.argv
    dateien = sorted(f for f in os.listdir(ORDNER) if f.lower().endswith(ENDUNGEN))
    ohne = []
    neu = 0
    for n in dateien:
        if not alle and n in daten:
            continue
        b = lies(os.path.join(ORDNER, n))
        g = gesicht(b) if b is not None else None
        if g:
            daten[n] = g
            neu += 1
        else:
            daten.pop(n, None)
            ohne.append(n)
    # Eintraege fuer Dateien, die es nicht mehr gibt, fallen weg.
    daten = {k: v for k, v in daten.items() if k in set(dateien)}
    with open(DATEI, 'w', encoding='utf8') as f:
        json.dump(dict(sorted(daten.items())), f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(daten)} von {len(dateien)} Fotos mit Gesicht ({neu} neu berechnet); ohne Treffer: {len(ohne)}')
    for n in ohne[:40]:
        print('  ohne:', n)


if __name__ == '__main__':
    main()
