# Auftrag: Draufsicht der Insel rendern (für Community → Map)

## Für dich (Betreiber) – so benutzt du diese Datei

1. Öffne auf deinem PC die **lokale Claude-Code-Sitzung**, die den Spiel-Export und die 3D-Insel hat.
2. Kopiere **alles ab der Linie „AUFTRAG FÜR DIE LOKALE SITZUNG“** und füge es dort als Nachricht ein.
3. Danach die Hub-Karte neu laden. Unten in der linken Tafel steht dann „map: top-down render of the island“ – dann ist das neue Bild aktiv.
4. **Das Bild bleibt NUR auf deinem PC.** Nichts davon committen oder pushen – das Repo ist öffentlich. `.gitignore` schützt den Ordner `public/hub-daten/karte/`.

Warum: Epics Kartenbild (2048 px) ist bunt und wird beim Hineinzoomen unscharf. Eine eigene Draufsicht aus der 3D-Insel ist ruhiger und scharf – wie bei fortnite.gg. Die Marker stehen dann besser davor.

---

## AUFTRAG FÜR DIE LOKALE SITZUNG

Du hast die exportierte BR-Insel als 3D-Szene. Rendere daraus **eine Draufsicht** für die Hub-Karte. Nur lokal arbeiten: **nichts committen, nichts pushen** (das Repo ist öffentlich, Epics Inhalte gehören nicht hinein).

**Zielordner:** `%USERPROFILE%\CompHubHub\public\hub-daten\karte\` (anlegen, falls er fehlt).

### 1. Kamera

- **Orthografisch** (keine Perspektive), schaut **senkrecht nach unten**.
- Bild **quadratisch**.
- Genau dieser Weltausschnitt (Unreal-Weltkoordinaten in **cm**, wie in `objekte.json`):

| | X (cm) | Y (cm) |
|---|---|---|
| Ecke **links oben** im Bild | −142 800 | −146 000 |
| Ecke **rechts unten** im Bild | 158 700 | 155 500 |
| **Mitte** | 7 950 | 4 750 |

- Breite = Höhe = **301 500 cm** (3 015 m).
- **Bildspalte = X** (nach rechts wird X größer), **Bildzeile = Y** (nach unten wird Y größer).
- Pixel → Welt: `X = −142800 + Spalte / Breite_px × 301500`, `Y = −146000 + Zeile / Höhe_px × 301500`.
- Nutzt deine 3D-Szene andere Achsen oder Meter (z. B. three.js: y nach oben), rechne um: 1 m = 100 cm; Unreal-X/Y sind die Bodenachsen.

### 2. Licht und Aussehen

- Heller Tag, Sonne hoch (Mittag), weiche kurze Schatten.
- **Kein Nebel**, keine Wolken, kein Sturm, keine Spieler, keine Beschriftung, keine UI.
- Wasser so lassen, wie es gerendert wird. Fläche außerhalb der Insel: Meer oder einfarbig `#0d5197` – **nicht transparent**.
- Natürliche Farben, nicht übersättigt.

### 3. Dateien

1. `render-8192.png` – 8192 × 8192 px (die scharfe Version; die Karte lädt sie erst beim starken Hineinzoomen). Optional zusätzlich als `render-8192.webp` (Qualität ~90), das ist viel kleiner.
2. `render.webp` – dasselbe Bild auf **4096 × 4096 px** verkleinert, WebP Qualität ~90. **Diese Datei muss da sein** – ohne sie bleibt die Karte beim alten Bild.

### 4. Prüfen, ob es passt

- Lege `render.webp` halbdurchsichtig über Epics Kartenbild https://www.thecomphub.com/bilder/karte-leer.png (gleicher Ausschnitt, auf gleiche Größe skalieren). Küsten und Straßen müssen genau übereinanderliegen.
- Liegt es gedreht oder gespiegelt: Kamera drehen bzw. die Achse umdrehen und neu rendern – nicht das Bild von Hand verschieben.
- Zusätzlich zwei Punkte prüfen: nimm zwei Objekte aus `public/hub-daten/objekte.json` (z. B. zwei Truhen weit auseinander), rechne ihre Pixel mit der Formel aus Schritt 1 aus und schau, ob dort im Bild wirklich die Truhe/das Gebäude steht.

### 5. Bericht

Kurz zurückmelden: Bildgrößen, Dateigrößen, wie du die Kamera gesetzt hast, ob die Überlagerung gepasst hat. **Nichts committen, nichts pushen.**
