# Auftrag: Replays in 3D mit echten Skins – nur lokal im Hub (localhost:5173)

## Für dich (Betreiber)
1. Erst den Karten-Export (`tools/export-auftrag.md`) fertig machen lassen – darauf baut das hier auf (3D-Insel unter `public/hub-daten/3d/`).
2. Danach in deiner lokalen 3D-Sitzung im Ordner `%USERPROFILE%\CompHubHub` einmal `git pull` und dann alles ab „AUFTRAG FÜR DIE LOKALE SITZUNG" reinkopieren.
3. Ergebnis: im Hub unter **Competitive → Replays** ein Spiel öffnen → Knopf **3D**. Nur auf deinem PC (Skins und Modelle gehören Epic – nichts davon kommt ins Repo oder auf die Seite).

---

## AUFTRAG FÜR DIE LOKALE SITZUNG

Ziel: Eine 3D-Wiedergabe eines Cup-Spiels auf der echten Insel, mit den echten Skin-Modellen der Spieler, im lokalen Hub. Ehrlich bleiben: keine erfundenen Daten; was die Quellen nicht hergeben, weglassen und im Bericht nennen.

### 1. Die Datei
- `public/hub-daten/3d/replay.html` (+ eigene Dateien unter `public/hub-daten/3d/replay/`). Baut auf deiner 3D-Insel auf (gleiche Szene, gleiche Koordinaten: Unreal-Weltkoordinaten in cm).
- **Nur lokal.** `.gitignore` deckt `public/hub-daten/3d/` ab – nicht committen, nicht pushen.

### 2. Woher die Spieldaten kommen
Der Hub öffnet `replay.html` in einem iframe und schickt per `postMessage` das Spiel:
```js
{ type: 'comphub-replay', match: <Antwort von GET /api/replay?match=<id>&v=4> }
```
Darin u. a. (geprüft am 28.11.2026):
- `spieler[]`: `{ id, epic, name, team, platz, tod, todX, todY, todUrsache, plattform }`
- `orte`: `{ "<spieler-id>": [[t, x, y, z], …] }` – Positionen über die Zeit (t in Sekunden)
- `bus[]`: `{ x, y, yaw, tempo, sprungAb, sprungBis, flugBis }`
- `zonen`, `sturmVerlauf`, `killVerlauf`, `treffer`, `schuesse`, `truhen`, `loot`, `bau`
Du kannst das Spiel auch selbst laden: `fetch('/api/replay?match=<id>&v=4')` (der Hub leitet `/api/` an thecomphub.com weiter).

### 3. Skins (was das Replay sagt)
- Die Server-Daten oben enthalten **noch keine Skin-IDs**. Zwei Wege – prüfen, welcher geht:
  a) Die rohe `.replay`-Datei des Spiels lokal mit FortniteReplayReader lesen (Cosmetics je Spieler: Character/Outfit-ID) – falls du an die Datei kommst.
  b) Sonst meldet die Cloud-Sitzung im Hub-Repo, sobald `/api/replay` ein Feld `skin` je Spieler mitliefert (wird dort eingebaut).
- Zur Outfit-ID das Modell aus den Spieldateien (CUE4Parse) als glTF/GLB exportieren, Cache unter `public/hub-daten/3d/replay/skins/<id>.glb`. Fehlt ein Modell: neutrale Figur in Teamfarbe.

### 4. Was die Ansicht können soll
- Zeitleiste (Play/Pause, ±10 s, Tempo 1×–20×), freie Kamera + „Spieler folgen" (Liste der Spieler/Teams), Ansicht von oben.
- Battle Bus auf seiner Route, Absprung/Gleiten (Höhe aus `z`), Figuren auf den Laufwegen mit Blickrichtung (aus der Bewegung), weich interpoliert.
- Zone/Sturm als Kreis/Wand, Schüsse/Treffer als kurze Linien, Knocks/Elims als Marker, ausgeschiedene Spieler verschwinden.
- Nicht nötig (zu großer Aufwand): echte Animationen (Laufen, Bauen, Editieren), Gebäude der Spieler.

### 5. Prüfen und melden
- `http://localhost:5173/hub-daten/3d/replay.html` öffnen, dann im Hub ein Replay → **3D**.
- Kurzer Bericht an den Betreiber: was geht, welche Skins gefunden wurden, was fehlt.
