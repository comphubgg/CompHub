"""Das Banner fuer das Discord-Profil des CompHub-Bots.

Der Betreiber: "mach mal Discord Banner + Infos mit meiner Seite, dass das
der Bot ist, und Discord-Invite-Link usw., einfach professionell."

Discord zeigt das Banner oben im Profil des Bots, 600 x 240 ist das
empfohlene Mass (2,5:1). Gebaut wird doppelt so gross, damit es auch auf
scharfen Bildschirmen sauber steht. Das Profilbild liegt im Popout unten
links ueber dem Banner - dort steht deshalb nichts Wichtiges.

Grund und Farben sind die der Seite: zinc-950 als Grund, das Blau der
Startseite (Sky 400/500) fuer das Zeichen und den Schein dahinter, die
Schrift Geist wie auf der Seite (einmal von Google Fonts geholt, ohne
Schluessel).

    python scripts/discord-banner-bauen.py
    -> data/discord/banner.png
"""
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WURZEL = Path(__file__).resolve().parent.parent
LOGO = WURZEL / 'public' / 'logos' / 'CompHub-Logo-frei.png'
ZIEL = WURZEL / 'data' / 'discord' / 'banner.png'
SCHRIFTEN = WURZEL / 'data' / 'discord' / 'schriften'

B, H = 1500, 600
GRUND = (9, 9, 11)          # zinc-950
GRUND_RECHTS = (8, 17, 31)  # ein Hauch Blau nach rechts
SKY_400 = (56, 189, 248)
SKY_500 = (14, 165, 233)
WEISS = (248, 250, 252)     # slate-50
GRAU = (148, 163, 184)      # slate-400
GRAU_DUNKEL = (100, 116, 139)  # slate-500

GEIST = {
    800: 'https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RHOQ4nQ.ttf',
    600: 'https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RQuQ4nQ.ttf',
    400: 'https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RnOM4nQ.ttf',
}


def schrift(gewicht: int, groesse: int) -> ImageFont.FreeTypeFont:
    """Geist in der Staerke - einmal geholt, danach aus data/discord/schriften."""
    SCHRIFTEN.mkdir(parents=True, exist_ok=True)
    datei = SCHRIFTEN / f'geist-{gewicht}.ttf'
    if not datei.exists():
        req = Request(GEIST[gewicht], headers={'User-Agent': 'Mozilla/5.0'})
        with urlopen(req, timeout=30) as antwort:
            datei.write_bytes(antwort.read())
    return ImageFont.truetype(str(datei), groesse)


def verlauf() -> Image.Image:
    """Der Grund: links zinc-950, nach rechts ein Hauch Blau."""
    bild = Image.new('RGB', (B, H), GRUND)
    px = bild.load()
    for x in range(B):
        t = x / (B - 1)
        farbe = tuple(round(GRUND[i] + (GRUND_RECHTS[i] - GRUND[i]) * t) for i in range(3))
        for y in range(H):
            px[x, y] = farbe
    return bild


def schein(bild: Image.Image, mitte: tuple[int, int], radius: int, farbe: tuple[int, int, int], staerke: int) -> None:
    """Ein weicher Lichtschein hinter dem Zeichen."""
    ebene = Image.new('RGBA', (B, H), (0, 0, 0, 0))
    z = ImageDraw.Draw(ebene)
    x, y = mitte
    z.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*farbe, staerke))
    ebene = ebene.filter(ImageFilter.GaussianBlur(radius * 0.55))
    bild.paste(ebene, (0, 0), ebene)


def zeichen(hoehe: int, farbe: tuple[int, int, int]) -> Image.Image:
    """Das Logo-Zeichen, auf eine Farbe gebracht - die Form kommt aus der Deckkraft."""
    logo = Image.open(LOGO).convert('RGBA')
    faktor = hoehe / logo.height
    logo = logo.resize((round(logo.width * faktor), hoehe), Image.LANCZOS)
    alpha = logo.getchannel('A')
    farbig = Image.new('RGBA', logo.size, (*farbe, 0))
    farbig.putalpha(alpha)
    return farbig


def raster(bild: Image.Image) -> None:
    """Ein sehr feines Raster - Technik, nicht Deko; kaum sichtbar."""
    ebene = Image.new('RGBA', (B, H), (0, 0, 0, 0))
    z = ImageDraw.Draw(ebene)
    for x in range(0, B, 50):
        z.line((x, 0, x, H), fill=(255, 255, 255, 6))
    for y in range(0, H, 50):
        z.line((0, y, B, y), fill=(255, 255, 255, 6))
    bild.paste(ebene, (0, 0), ebene)


def main() -> None:
    bild = verlauf().convert('RGBA')
    raster(bild)

    # Der Schein und das Zeichen rechts - weg vom Profilbild unten links.
    schein(bild, (1180, 300), 300, SKY_500, 70)
    mark = zeichen(330, SKY_400)
    bild.paste(mark, (1180 - mark.width // 2, 300 - mark.height // 2), mark)

    z = ImageDraw.Draw(bild)
    # Kopfzeile: die Adresse, klein und mit Abstand - wie eine Kennung.
    z.text((90, 70), 'THECOMPHUB.COM', font=schrift(600, 30), fill=SKY_400)
    # Der Name gross, darunter, was es ist.
    z.text((86, 116), 'CompHub', font=schrift(800, 128), fill=WEISS)
    z.text((90, 276), 'Fortnite Competitive', font=schrift(600, 50), fill=GRAU)
    z.text((90, 338), 'Stats · Tournaments · Live Leaderboards · Rankings', font=schrift(400, 32), fill=GRAU_DUNKEL)

    # Ein duenner Strich im Blau der Seite unter dem Namen - wie der Akzent auf der Startseite.
    z.rounded_rectangle((90, 258, 330, 264), radius=3, fill=SKY_500)

    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    bild.convert('RGB').save(ZIEL, 'PNG', optimize=True)
    print(f'geschrieben: {ZIEL.relative_to(WURZEL)} ({ZIEL.stat().st_size // 1024} KB, {B}x{H})')


if __name__ == '__main__':
    main()
