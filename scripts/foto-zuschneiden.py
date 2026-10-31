# Spielerfotos automatisch zuschneiden wie die des Betreibers (31.10.2026: "ich schicke dir Bilder, die ich nicht zuschneide - das musst du wie von
# selbst koennen ... nichts abgeschnitten vom Koerper, vor allem nichts vom Gesicht").
#
# Vorbild sind seine eigenen Zuschnitte (Hochformat 4:5, 400x500), an 31 davon gemessen: Gesicht waagrecht mittig, Gesichtsmitte bei 36 % der Hoehe,
# Gesicht 45 % so breit wie das Bild. Hier wird das Gesicht gesucht (OpenCV, wie scripts/foto-fokus.py) und der 4:5-Ausschnitt so gelegt, dass es
# genauso sitzt. Reicht das Foto dafuer nicht (Gesicht zu nah am Rand oder zu gross), wird der Ausschnitt groesser statt das Gesicht anzuschneiden -
# der Kopf bleibt immer ganz drin. Ohne gefundenes Gesicht: waagrecht Mitte, oben buendig (Spieler sitzen fast immer oben im Bild).
#
#   python scripts/foto-zuschneiden.py EINGANG.jpg [...] --ziel ORDNER     schreibt NAME.jpg (800x1000, sonst so gross wie moeglich)
#   --probe                                                                 zeigt nur, was es taete

import os
import sys

import cv2
import numpy as np

# Namen wie DEMUŚ: OpenCV liest und schreibt unter Windows keine Pfade ausserhalb der Systemcodepage, und die Ausgabe darf daran nicht abbrechen.
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

MITTE_X, MITTE_Y, BREITE = 0.50, 0.36, 0.45
ZIEL_B, ZIEL_H = 800, 1000

muster = [cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, n))
          for n in ('haarcascade_frontalface_default.xml', 'haarcascade_frontalface_alt2.xml', 'haarcascade_profileface.xml')]


ANZAHL = {}  # Dateiname -> wie viele Gesichter (fuer --bericht: Gruppenfotos nicht blind uebernehmen)


def gesicht(bild, name=None):
    """(x, y, w, h) des groessten Gesichts in Pixeln, oder None. Zaehlt nebenbei alle Gesichter, die mindestens halb so gross sind."""
    grau = cv2.equalizeHist(cv2.cvtColor(bild, cv2.COLOR_BGR2GRAY))
    h, b = grau.shape
    for i, m in enumerate(muster):
        for stufe in (0.10, 0.05):
            klein = int(min(b, h) * stufe)
            bilder = [grau] if i < 2 else [grau, cv2.flip(grau, 1)]
            funde = []
            for k, g in enumerate(bilder):
                for (x, y, w, hh) in m.detectMultiScale(g, scaleFactor=1.06, minNeighbors=6, minSize=(klein, klein)):
                    if k == 1:
                        x = b - x - w
                    # Gesichter im unteren Drittel sind Logos auf dem Trikot oder Haende.
                    if (y + hh / 2) / h < 0.66:
                        funde.append((x, y, w, hh))
            if funde:
                gross = max(funde, key=lambda f: f[2] * f[3])
                if name is not None:
                    einzeln = [gross]
                    for f in sorted(funde, key=lambda f: -f[2] * f[3]):
                        if f[2] >= gross[2] * 0.5 and not any(ueberlappt(f, e) for e in einzeln):
                            einzeln.append(f)
                    ANZAHL[name] = len(einzeln)
                return gross
    if name is not None:
        ANZAHL[name] = 0
    return None


def ueberlappt(a, b):
    """Dasselbe Gesicht zweimal gefunden (ein Muster meldet oft leicht versetzte Doppel)."""
    if a is b:
        return True
    ax, ay = a[0] + a[2] / 2, a[1] + a[3] / 2
    bx, by = b[0] + b[2] / 2, b[1] + b[3] / 2
    return abs(ax - bx) < max(a[2], b[2]) * 0.6 and abs(ay - by) < max(a[3], b[3]) * 0.6


def ausschnitt(b, h, g):
    """Der 4:5-Ausschnitt (x, y, breite, hoehe) im Original."""
    if g is None:
        cb = min(b, h * 0.8)
        return int((b - cb) / 2), 0, int(cb), int(cb / 0.8)
    x, y, w, hh = g
    fx, fy = x + w / 2, y + hh / 2
    cb = w / BREITE
    # Nie winziger als die Haelfte des Fotos: ein sehr kleiner Ausschnitt heisst fast immer, dass die Erkennung etwas anderes fuer ein Gesicht hielt
    # (NOAHWPLAYS, 31.10.2026: im Profil fotografiert, erkannt wurde das Kinn mit dem Mikrofon). Die Spieler fuellen ihre Fotos meist ohnehin gross.
    cb = max(cb, min(b, h * 0.8) * 0.5)
    # Nicht groesser als das Foto
    cb = min(cb, b, h * 0.8)
    while True:
        ch = cb / 0.8
        cx = fx - cb * MITTE_X
        cy = fy - ch * MITTE_Y
        cx = max(0, min(b - cb, cx))
        cy = max(0, min(h - ch, cy))
        # Der Kopf (Gesicht samt Haaren und Kinn, etwas Luft) muss ganz drin sein; sonst den Ausschnitt groesser machen.
        kopf_oben, kopf_unten = y - hh * 0.7, y + hh * 1.25
        kopf_links, kopf_rechts = x - w * 0.25, x + w * 1.25
        drin = cx <= max(0, kopf_links) and cx + cb >= min(b, kopf_rechts) and cy <= max(0, kopf_oben) and cy + ch >= min(h, kopf_unten)
        if drin or cb >= min(b, h * 0.8) - 1:
            return int(cx), int(cy), int(cb), int(ch)
        cb = min(cb * 1.08, b, h * 0.8)


def zuschneiden(eingang, ziel, probe=False):
    try:
        bild = cv2.imdecode(np.fromfile(eingang, dtype=np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        bild = None
    if bild is None:
        print(f'  {os.path.basename(eingang)}: nicht lesbar')
        return None
    h, b = bild.shape[:2]
    name = os.path.splitext(os.path.basename(eingang))[0]
    name = os.path.splitext(name)[0]  # "FASTROKI.png.jpg"
    g = gesicht(bild, name)
    x, y, cb, ch = ausschnitt(b, h, g)
    aus = os.path.join(ziel, name + '.jpg')
    print(f'  {os.path.basename(eingang)} ({b}x{h}): Gesicht {"gefunden" if g is not None else "NICHT gefunden - Mitte oben"}, Ausschnitt {cb}x{ch} bei {x},{y} -> {aus}')
    if probe:
        return aus
    teil = bild[y:y + ch, x:x + cb]
    zb = min(ZIEL_B, cb)
    teil = cv2.resize(teil, (zb, int(zb / 0.8)), interpolation=cv2.INTER_AREA)
    os.makedirs(ziel, exist_ok=True)
    ok, puffer = cv2.imencode('.jpg', teil, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if ok:
        puffer.tofile(aus)
    return aus


if __name__ == '__main__':
    args = sys.argv[1:]
    probe = '--probe' in args
    ziel = '.'
    if '--ziel' in args:
        ziel = args[args.index('--ziel') + 1]
    bericht = args[args.index('--bericht') + 1] if '--bericht' in args else None
    dateien = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] not in ('--ziel', '--bericht'))]
    for d in dateien:
        zuschneiden(d, ziel, probe)
    if bericht:
        # Ergaenzt eine vorhandene Datei (das Skript laeuft in Haeppchen zu 50 Bildern).
        import json
        alt = {}
        if os.path.exists(bericht):
            with open(bericht, encoding='utf8') as f:
                alt = json.load(f)
        alt.update(ANZAHL)
        with open(bericht, 'w', encoding='utf8') as f:
            json.dump(alt, f, ensure_ascii=False)
