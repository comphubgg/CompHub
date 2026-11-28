# Auftrag: Replays in 3D mit echten Skins – nur lokal im Hub (localhost:5173)

## Für dich (Betreiber)
1. Erst den Karten-Export (`tools/export-auftrag.md`) fertig machen lassen – darauf baut das hier auf (3D-Insel unter `public/hub-daten/3d/`).
2. Danach in deiner lokalen 3D-Sitzung im Ordner `%USERPROFILE%\CompHubHub` einmal `git pull` und dann alles ab „AUFTRAG FÜR DIE LOKALE SITZUNG" reinkopieren.
3. Ergebnis: im Hub unter **Competitive → Replays** ein Spiel öffnen → Knopf **3D**. Nur auf deinem PC. Die Figuren sind **eigene Modelle** (keine Epic-Dateien), eingefärbt nach dem Skin, mit eigenen Animationen.

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

### 3. Figuren: eigene Modelle, echte Animationen (Betreiber, 28.11.2026: "sie sollen wirklich laufen, animiert sein, wirklich perfekt")
**Eigene Modelle statt Epic-Modelle.** Baue EIN eigenes, leicht klotziges Figuren-Modell (Low-Poly, Fortnite-Proportionen, eigenes Rigging in three.js – SkinnedMesh + eigene AnimationClips, keine Epic-Dateien) und färbe es pro Spieler so ein, dass man seinen Skin erkennt:
- Skin erkennen: zur Outfit-ID (sobald `/api/replay` das Feld `skin` liefert – kommt; oder aus der rohen .replay-Datei) das offizielle Icon von fortnite-api.com (`/v2/cosmetics/br/<id>` → `images.icon`) laden, daraus die Hauptfarben ziehen (Oberkörper/Beine/Kopf/Akzent) und auf das Modell legen; das Icon zusätzlich als kleines Schild über dem Kopf (abschaltbar). Spitzhacke und Rucksack genauso: eigene einfache Formen in den Farben ihrer Icons.
- Waffen: eigene einfache Modelle je Waffenklasse (Pump, AR, SMG, Pistole, Sniper, Bogen …) in Seltenheitsfarbe, in der Hand – welche Waffe gerade gehalten wird, steht in den Replay-Daten (`hand`, `waffenNamen`, `schuesse`).
- Animationen (eigene Clips, weich überblendet), aus den Daten abgeleitet: Stehen, Gehen/Rennen (aus der Geschwindigkeit), Springen/Fallen (aus z), Absprung aus dem Bus, Fallschirm/Gleiter, Schwimmen (Höhe ≈ Wasser), Ducken wenn erkennbar, Schießen (aus `schuesse`/`treffer` – Rückstoß + Mündungsblitz + Linie zum Ziel), Spitzhacke beim Abbauen (`abbau`), Bauen (`bau` – Bau-Geste + das Bauteil erscheint), Editieren falls die Daten es zeigen, Heilen (Daten zu Heilung), Knock (kriechen), Elim (umfallen, verschwinden), Emotes nur wenn das Replay sie enthält.
- Gebäude: aus `bau` die gebauten Teile (Wand/Boden/Treppe/Dach, Material Holz/Stein/Metall, Position/Drehung im 5-m-Raster) als eigene einfache Bauteile erscheinen lassen; abgebaut/zerstört → zerbrechen (kurze Splitter-Animation) – soweit die Replay-Daten Zerstörung enthalten. Prüfe, welche Felder es dazu gibt, und nenne Lücken im Bericht.

### 4. Was die Ansicht können soll
- Zeitleiste (Play/Pause, ±10 s, Tempo 0,25×–20×), freie Kamera, „Spieler folgen" (Schulterkamera hinter dem Spieler, wie im Spiel), Ansicht von oben.
- Battle Bus auf seiner Route, Absprung, Figuren auf den Laufwegen mit Blickrichtung, weich interpoliert.
- Zone/Sturm als Wand, Schüsse/Treffer, Knocks/Elims mit Killfeed, ausgeschiedene Spieler verschwinden.
- Die Kartenobjekte aus `objekte.json` (Truhen usw.) in der Szene.
- Flüssig: Ziel 60 fps bei 100 Spielern (Instancing, LOD für weit entfernte Figuren).

### 5. Prüfen und melden
- `http://localhost:5173/hub-daten/3d/replay.html` öffnen, dann im Hub ein Replay → **3D**.
- Kurzer Bericht an den Betreiber: was geht, welche Skins gefunden wurden, was fehlt.
