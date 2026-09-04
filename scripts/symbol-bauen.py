"""Das Seitensymbol aus dem CompHub-Logo bauen.

Im Reiter des Browsers und in Googles Ergebnisliste stand bisher ein
fremdes Dreieck - das Symbol, das seit dem ersten Tag im Projekt lag und mit
CompHub nichts zu tun hat. Ersetzt wird es hier durch das eigene Logo.

Das Logo ist breiter als hoch und hat einen durchsichtigen Grund. Ein Symbol
ist dagegen quadratisch und wird sehr klein angezeigt, oft auf hellem Grund.
Deshalb wird es hier auf eine quadratische Flaeche gesetzt, mit etwas Luft am
Rand - ohne die klebt das Zeichen im Reiter an den Kanten und wirkt gedrungen.

    python scripts/symbol-bauen.py
"""

from pathlib import Path
from PIL import Image

WURZEL = Path(__file__).resolve().parent.parent
QUELLE = WURZEL / 'public' / 'logos' / 'CompHub-Logo-frei.png'

# Der Grund des Werkzeugs. Ein durchsichtiges Symbol verschwindet auf einem
# dunklen Reiter; dieser Ton ist derselbe wie der der Seite (zinc-950).
GRUND = (9, 9, 11, 255)

# Wie viel vom Quadrat der Rand einnimmt.
LUFT = 0.10


def quadrat(kante: int) -> Image.Image:
    logo = Image.open(QUELLE).convert('RGBA')

    # Auf die Flaeche innerhalb der Luft einpassen, Seitenverhaeltnis behalten.
    innen = int(kante * (1 - 2 * LUFT))
    faktor = min(innen / logo.width, innen / logo.height)
    neu = logo.resize(
        (max(1, round(logo.width * faktor)), max(1, round(logo.height * faktor))),
        Image.LANCZOS,
    )

    flaeche = Image.new('RGBA', (kante, kante), GRUND)
    flaeche.paste(neu, ((kante - neu.width) // 2, (kante - neu.height) // 2), neu)
    return flaeche


def main() -> None:
    if not QUELLE.exists():
        raise SystemExit(f'Logo nicht gefunden: {QUELLE}')

    # Next.js nimmt diese Dateien von selbst: app/icon.png fuer den Reiter,
    # app/apple-icon.png fuer den Startbildschirm auf dem Telefon.
    quadrat(512).save(WURZEL / 'app' / 'icon.png')
    quadrat(180).save(WURZEL / 'app' / 'apple-icon.png')

    # Und die klassische .ico-Datei, weil manche Zwischenstellen - Google
    # darunter - weiterhin danach fragen. Mehrere Groessen in einer Datei.
    quadrat(256).save(
        WURZEL / 'app' / 'favicon.ico',
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    print('geschrieben: app/icon.png, app/apple-icon.png, app/favicon.ico')


if __name__ == '__main__':
    main()
