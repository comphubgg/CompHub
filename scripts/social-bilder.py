"""Profilbilder fuer X und TikTok aus dem CompHub-Logo.

Ein Profilbild ist etwas anderes als ein Logo auf einer Seite. Es steht im
Kreis, meist bei 40 Pixeln Kantenlaenge, neben einem Namen - und wird von der
Plattform selbst noch einmal verkleinert. Was dort funktioniert, hat drei
Eigenschaften: es ist quadratisch, es hat Luft am Rand, und es besteht aus
wenigen kraeftigen Formen.

Deshalb hier nur das Zeichen, ohne Schriftzug: "COMPHUB" waere bei 40 Pixeln
ein grauer Strich. Und deshalb ein dunkler Grund - das Zeichen ist hell und
verschwindet auf Weiss, sobald es klein wird.

Erzeugt wird beides, dunkel und hell, damit die Wahl bleibt:

    python scripts/social-bilder.py

Die Dateien landen unter public/social/ und lassen sich dort direkt hochladen.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

WURZEL = Path(__file__).resolve().parent.parent
QUELLE = WURZEL / 'public' / 'logos' / 'CompHub-Logo-frei.png'
ZIEL = WURZEL / 'public' / 'social'

# Der Grund der Seite (zinc-950) - dasselbe Dunkel wie ueberall im Werkzeug.
DUNKEL = (9, 9, 11, 255)
HELL = (255, 255, 255, 255)

# Wie viel vom Quadrat das Zeichen einnimmt.
#
# 0.62 statt 0.8: die Plattformen schneiden einen Kreis aus dem Quadrat, und
# an den Ecken geht dabei mehr verloren, als man denkt. Was bis an den Rand
# reicht, wird beschnitten.
ANTEIL = 0.62

KANTE = 1024


def bild(grund, mit_schein: bool) -> Image.Image:
    logo = Image.open(QUELLE).convert('RGBA')

    innen = int(KANTE * ANTEIL)
    faktor = min(innen / logo.width, innen / logo.height)
    neu = logo.resize(
        (max(1, round(logo.width * faktor)), max(1, round(logo.height * faktor))),
        Image.LANCZOS,
    )

    flaeche = Image.new('RGBA', (KANTE, KANTE), grund)

    if mit_schein:
        # Ein ruhiger Schein hinter dem Zeichen, damit es auf Dunkel nicht
        # aufgeklebt wirkt. Kein Effekt um seiner selbst willen: ohne ihn
        # steht das Blau hart auf Schwarz und wirkt bei kleiner Ansicht flach.
        schein = Image.new('RGBA', (KANTE, KANTE), (0, 0, 0, 0))
        zeichner = ImageDraw.Draw(schein)
        rand = KANTE // 4
        zeichner.ellipse(
            [rand, rand, KANTE - rand, KANTE - rand],
            fill=(0, 149, 246, 60),
        )
        flaeche.alpha_composite(schein.filter(ImageFilter.GaussianBlur(KANTE // 10)))

    flaeche.paste(neu, ((KANTE - neu.width) // 2, (KANTE - neu.height) // 2), neu)
    return flaeche


def main() -> None:
    if not QUELLE.exists():
        raise SystemExit(f'Logo nicht gefunden: {QUELLE}')
    ZIEL.mkdir(parents=True, exist_ok=True)

    bild(DUNKEL, True).save(ZIEL / 'comphub-profilbild-dunkel.png')
    bild(HELL, False).save(ZIEL / 'comphub-profilbild-hell.png')

    # Und einmal klein, um zu sehen, ob es bei der Groesse noch traegt, in der
    # es wirklich erscheint. Wer nur die grosse Fassung ansieht, uebersieht,
    # dass die Feinheiten verschwinden.
    for name in ('comphub-profilbild-dunkel', 'comphub-profilbild-hell'):
        klein = Image.open(ZIEL / f'{name}.png').resize((96, 96), Image.LANCZOS)
        klein.save(ZIEL / f'{name}-probe-96.png')

    print(f'geschrieben nach {ZIEL}:')
    for d in sorted(ZIEL.glob('comphub-profilbild*.png')):
        print(f'  {d.name}')


if __name__ == '__main__':
    main()
