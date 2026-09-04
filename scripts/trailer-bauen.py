# Aus den Aufnahmen einen Film machen.
#
# Kein Bildschirmmitschnitt, sondern gebaut: jede Aufnahme bekommt eine ruhige
# Fahrt (langsames Heranfahren oder Schwenken), die Szenen gehen ineinander
# ueber, und darueber liegt eine Zeile, die sagt, was man sieht. Das sieht
# sauberer aus als ein Mitschnitt und braucht keinen Menschen, der klickt.
#
# Aufruf:  python scripts/trailer-bauen.py
# Ergebnis: dist/CompHub-Trailer.mp4

import json
import math
import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUELLE = os.path.join(WURZEL, 'dist', 'trailer')
ZIEL = os.path.join(WURZEL, 'dist', 'CompHub-Trailer.mp4')

BREITE, HOEHE = 1280, 720
FPS = 24
# Sekunden je Szene und Laenge des Uebergangs.
DAUER = 10.5
BLENDE = 0.7

GRUND = (9, 9, 11)
BLAU = (56, 189, 248)
WEISS = (255, 255, 255)
LEISE = (147, 164, 200)


def schrift(groesse, fett=True):
    """Segoe UI - die Schrift, die das Werkzeug selbst benutzt."""
    for name in (('segoeuib.ttf', 'seguisb.ttf') if fett else ('segoeui.ttf',)):
        pfad = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', name)
        if os.path.exists(pfad):
            return ImageFont.truetype(pfad, groesse)
    return ImageFont.load_default()


TITEL_F = schrift(52)
UNTER_F = schrift(26, fett=False)
MARKE_F = schrift(30)


def sanft(t):
    """Weiches Ein- und Ausgleiten - lineare Fahrten wirken maschinell."""
    return t * t * (3 - 2 * t)


def bildschirm(pfad):
    """Eine Aufnahme auf Videobreite bringen, oben ausgerichtet."""
    im = Image.open(pfad).convert('RGB')
    # Auf die Videobreite mal 1.18 - der Rest ist Spielraum fuer die Fahrt.
    ziel_b = int(BREITE * 1.18)
    ziel_h = int(im.height * ziel_b / im.width)
    return im.resize((ziel_b, ziel_h), Image.LANCZOS)


def fahrt(gross, t, richtung):
    """
    Ein Ausschnitt zum Zeitpunkt t (0 bis 1).

    Abwechselnd wird herangefahren und geschwenkt, damit nicht jede Szene
    dieselbe Bewegung macht.
    """
    e = sanft(t)
    if richtung % 2 == 0:
        zoom = 1.00 + 0.06 * e          # langsam heran
        x = (gross.width - BREITE * zoom) / 2
        y = (gross.height - HOEHE * zoom) * 0.10
    else:
        zoom = 1.06 - 0.06 * e          # langsam heraus
        x = (gross.width - BREITE * zoom) * (0.15 + 0.70 * e)
        y = (gross.height - HOEHE * zoom) * 0.12
    x = max(0, min(x, gross.width - BREITE * zoom))
    y = max(0, min(y, gross.height - HOEHE * zoom))
    aus = gross.crop((int(x), int(y),
                      int(x + BREITE * zoom), int(y + HOEHE * zoom)))
    return aus.resize((BREITE, HOEHE), Image.BILINEAR)


def textband(titel, unter):
    """Die Beschriftung als fertige Ebene - einmal je Szene, nicht je Bild."""
    ebene = Image.new('RGBA', (BREITE, HOEHE), (0, 0, 0, 0))
    d = ImageDraw.Draw(ebene)
    # Ein dunkler Verlauf unten, damit die Schrift auf hellen Stellen haelt.
    for i in range(230):
        y = HOEHE - 230 + i
        d.line([(0, y), (BREITE, y)], fill=(9, 9, 11, int(215 * (i / 230) ** 1.5)))
    d.rectangle([64, HOEHE - 148, 70, HOEHE - 92], fill=BLAU + (255,))
    d.text((88, HOEHE - 156), titel, font=TITEL_F, fill=WEISS + (255,))
    d.text((88, HOEHE - 88), unter, font=UNTER_F, fill=LEISE + (255,))
    return ebene


def blende(ebene, t):
    """Die Beschriftung fahrt von unten ein und am Ende wieder hinaus."""
    if t < 0.06:
        a = 0.0
    elif t < 0.22:
        a = sanft((t - 0.06) / 0.16)
    elif t > 0.94:
        a = 1 - sanft(min(1, (t - 0.94) / 0.06))
    else:
        a = 1.0
    if a <= 0.001:
        return None
    versatz = int(26 * (1 - a))
    e = ebene
    if versatz:
        e = Image.new('RGBA', (BREITE, HOEHE), (0, 0, 0, 0))
        e.paste(ebene, (0, versatz))
    if a < 0.999:
        alpha = e.getchannel('A').point(lambda p: int(p * a))
        e = e.copy()
        e.putalpha(alpha)
    return e


def karte(zeile1, zeile2, t):
    """Die Titel- und Schlusstafel."""
    im = Image.new('RGB', (BREITE, HOEHE), GRUND)
    d = ImageDraw.Draw(im)
    # Ein leichter Schimmer, damit die Tafel nicht tot wirkt.
    for i in range(HOEHE):
        f = 1 - abs(i - HOEHE * 0.42) / (HOEHE * 1.4)
        d.line([(0, i), (BREITE, i)],
               fill=(int(9 + 16 * f * f), int(9 + 26 * f * f), int(11 + 44 * f * f)))
    e = sanft(min(1, t * 3)) if t < 0.34 else (1 - sanft(min(1, (t - 0.88) / 0.12)) if t > 0.88 else 1)
    lauf = ImageDraw.Draw(im)
    b1 = lauf.textbbox((0, 0), zeile1, font=MARKE_F if len(zeile1) < 12 else TITEL_F)
    f1 = MARKE_F if len(zeile1) < 12 else TITEL_F
    breite1 = b1[2] - b1[0]
    y = int(HOEHE * 0.40 + 20 * (1 - e))
    schatten = Image.new('RGBA', (BREITE, HOEHE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(schatten)
    sd.text(((BREITE - breite1) / 2, y), zeile1, font=f1,
            fill=WEISS + (int(255 * e),))
    b2 = sd.textbbox((0, 0), zeile2, font=UNTER_F)
    sd.text(((BREITE - (b2[2] - b2[0])) / 2, y + 76), zeile2, font=UNTER_F,
            fill=LEISE + (int(255 * e),))
    sd.rectangle([(BREITE / 2 - 26, y + 62), (BREITE / 2 + 26, y + 66)],
                 fill=BLAU + (int(255 * e),))
    im = Image.alpha_composite(im.convert('RGBA'), schatten).convert('RGB')
    return im


def main():
    with open(os.path.join(QUELLE, 'szenen.json'), encoding='utf-8') as f:
        szenen = json.load(f)
    szenen = [s for s in szenen
              if os.path.exists(os.path.join(QUELLE, s['datei']))]
    if not szenen:
        print('Keine Aufnahmen gefunden - erst scripts/trailer-aufnehmen.mjs laufen lassen.')
        return 1

    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs(os.path.dirname(ZIEL), exist_ok=True)

    befehl = [
        ffmpeg, '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
        '-s', f'{BREITE}x{HOEHE}', '-r', str(FPS), '-i', '-',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ZIEL,
    ]
    p = subprocess.Popen(befehl, stdin=subprocess.PIPE,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def schreib(im):
        p.stdin.write(im.tobytes())

    # ---------------------------------------------------------- Titeltafel
    for i in range(int(FPS * 2.6)):
        schreib(karte('CompHub', 'Fortnite Competitive', i / (FPS * 2.6)))

    # ------------------------------------------------------------- Szenen
    vorbereitet = []
    for s in szenen:
        gross = bildschirm(os.path.join(QUELLE, s['datei']))
        vorbereitet.append((gross, textband(s['titel'], s['unter'])))

    bilder = int(FPS * DAUER)
    ueber = int(FPS * BLENDE)

    for i, (gross, band) in enumerate(vorbereitet):
        letzte = i == len(vorbereitet) - 1
        # Die ersten Bilder wurden schon beim Uebergang der Szene davor
        # verbraucht - sonst haenge jede Szene kurz still.
        start = 0 if i == 0 else ueber
        for f in range(start, bilder):
            t = f / bilder
            im = fahrt(gross, t, i)
            e = blende(band, t)
            if e is not None:
                im = Image.alpha_composite(im.convert('RGBA'), e).convert('RGB')
            if not letzte and f >= bilder - ueber:
                # Ueberblenden in die naechste Szene.
                k = (f - (bilder - ueber)) / ueber
                g2, b2 = vorbereitet[i + 1]
                t2 = (k * ueber) / bilder
                im2 = fahrt(g2, t2, i + 1)
                e2 = blende(b2, t2)
                if e2 is not None:
                    im2 = Image.alpha_composite(im2.convert('RGBA'), e2).convert('RGB')
                im = Image.blend(im, im2, sanft(k))
            schreib(im)
        sys.stdout.write(f'\r  Szene {i + 1}/{len(vorbereitet)}')
        sys.stdout.flush()

    # --------------------------------------------------------- Schlusstafel
    for i in range(int(FPS * 3.0)):
        schreib(karte('CompHub', 'comphub.gg', i / (FPS * 3.0)))

    p.stdin.close()
    p.wait()
    dauer = (2.6 + 3.0 + DAUER + (len(vorbereitet) - 1) * (DAUER - BLENDE))
    print(f'\nFertig: {ZIEL}')
    print(f'Laenge etwa {int(dauer // 60)}:{int(dauer % 60):02d} Minuten, '
          f'{BREITE}x{HOEHE} bei {FPS} Bildern je Sekunde.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
