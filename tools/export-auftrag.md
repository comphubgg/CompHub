# Export-Auftrag: Waffenwerte, Fundchancen und Karten-Objekte aus den Fortnite-Spieldateien

## Für dich (Betreiber) – so benutzt du diese Datei

1. Öffne auf deinem PC die **lokale Claude-Code-Sitzung**, die schon mit CUE4Parse/FModel an den Spieldateien arbeitet.
2. Kopiere **alles ab der Linie „AUFTRAG FÜR DIE LOKALE SITZUNG“** und füge es dort als Nachricht ein.
3. Die Sitzung meldet sich nach **Schritt 1** (Bestandsaufnahme) mit einer kurzen Liste zurück. Schau kurz drüber („passt das?“), dann lässt du sie weitermachen.
4. Am Ende liegen im Hub mindestens `public/hub-daten/waffen.json` und `public/hub-daten/objekte.json`, dazu wenn möglich `assets.json` (+ Bilder), die Original-Kartensymbole unter `icons/karte/`, die 3D-Ansicht der Insel unter `3d/`, `saison.json`, `rotation.json`. Die Hub-Seiten **Weapons**, **Map**, **Asset Studio**, **Season**, **XP Calculator** und **Map Rotation** zeigen sie automatisch an, sobald sie da sind (ein Neuladen reicht).

Warum so: fortnite.gg dürfen wir nicht abgreifen (deren Daten, Cloudflare). Die Spieldateien auf deinem PC sind die saubere Quelle – daraus rechnet fortnite.gg selbst auch.

---

## AUFTRAG FÜR DIE LOKALE SITZUNG

Du hast lokalen Zugriff auf die Fortnite-Installation und arbeitest mit **CUE4Parse** (oder FModel). Exportiere zwei JSON-Dateien für die CompHub-Hub-Vorschau. Regel Nummer eins: **Keine Zahl erfinden oder schätzen.** Was du nicht sicher aus den Dateien lesen kannst, lässt du weg (Feld weglassen oder `null`) und schreibst es in den Bericht.

**Zielordner:** Der Hub liegt auf diesem PC unter `%USERPROFILE%\CompHubHub` (z. B. `C:\Users\<Name>\CompHubHub`). Alle Pfade `public/hub-daten/...` unten sind relativ zu diesem Ordner. Diese Dateien bleiben NUR auf diesem PC – NICHT committen, NICHT pushen (das Repo ist öffentlich; Epics Daten und Bilder gehören nicht hinein). `.gitignore` schützt sie, und der automatische Abgleich lässt sie in Ruhe.

### Schritt 0 – Vorbereitung (sicher nötig)

- **AES-Schlüssel**: Die Fortnite-Paks sind verschlüsselt. Hauptschlüssel und dynamische Schlüssel des aktuellen Builds brauchst du (z. B. von fortnite-api.com `/v2/aes` – prüfen, dass der Build zur Installation passt).
- **Mappings (.usmap)**: Fortnite speichert Properties „unversioned“. Ohne passende `.usmap` zum aktuellen Build liest CUE4Parse die Felder falsch oder gar nicht. Passende Mappings für genau diesen Build besorgen (FModel lädt sie über seine Endpoint-Einstellung automatisch).
- Notiere die **Build-Version** (z. B. `++Fortnite+Release-xx.xx-CL-…`) – sie kommt in beide Dateien.
- GameFeature-Plugins mitladen: Viele neue Waffen und Loot-Tabellen liegen **nicht** unter `FortniteGame/Content/…`, sondern unter `FortniteGame/Plugins/GameFeatures/<Name>/Content/…`.

### Schritt 1 – Bestandsaufnahme, dann kurz melden (STOPP-Punkt)

Bevor du die eigentlichen Dateien baust, melde dem Betreiber kurz:

1. Welche **Battle-Royale-Playlist** aktiv ist (z. B. `Playlist_DefaultSolo` / `…Duo` / `…Squad`) und welche Loot-Tabellen sie benutzt (siehe Schritt 3a).
2. Liste aller **TierGroup-Namen** in diesen Loot-Tabellen mit Anzahl Zeilen (z. B. `Loot_AthenaTreasure`, `Loot_AthenaFloorLoot` …) – und welche du für **Boden**, **Truhe**, **Munitionskiste**, **Versorgungsabwurf** hältst.
3. Liste der **Waffen (WIDs)**, die im Loot-Pool vorkommen, mit Anzahl Seltenheiten.
4. Für die Karte: Liste der **Actor-Klassen** auf der BR-Hauptkarte, deren Name `Chest`, `Ammo`, `Slurp`, `Reboot`, `Launch`, `Zipline`, `Vending`, `Fish` enthält – mit Anzahl. (Damit wir gemeinsam entscheiden, welche Klasse zu welcher Ebene gehört.)

Erst nach „passt“ weitermachen.

### Schritt 2 – Waffenwerte

**Was sicher ist** (aus den Strukturen `FFortBaseWeaponStats` / `FFortRangedWeaponStats` und `UFortWeaponItemDefinition`):

- Jede Waffe hat pro Seltenheit eine eigene **Item-Definition** (Asset `WID_…`, z. B. `WID_Assault_…_Athena_R`). Die Seltenheit steht im Property **`Rarity`** der WID (fehlt das Property, gilt der Standardwert des Spiels – im Zweifel im Bericht vermerken; Kürzel im Namen: `_C` Common, `_UC` Uncommon, `_R` Rare, `_VR` Epic, `_SR` Legendary, `_UR` Mythic).
- Der Anzeigename steht in **`ItemName`** (englischen Text nehmen), das Symbol in **`LargePreviewImage`** (bzw. `SmallPreviewImage`), die Munitionsart über **`AmmoData`**.
- Die WID hat **`WeaponStatHandle`** = (DataTable + RowName). **Diesem Verweis folgen** – das ist die Zeile mit den Werten. Nicht nach Namen raten: Viele neue Waffen haben eigene Stat-Tabellen im jeweiligen GameFeature-Plugin, ältere stehen in einer zentralen Tabelle (früher `AthenaRangedWeapons`).
- Felder in der Stat-Zeile:

| JSON-Feld | Quelle in der Stat-Zeile | Hinweis |
|---|---|---|
| `damage` | `DmgPB` | Körpertreffer je Kugel bzw. je Schrotkugel |
| `pellets` | `BulletsPerCartridge` | Schrotkugeln je Schuss (0 oder 1 = eine Kugel → `1`) |
| `headshotMultiplier` | `DamageZone_Critical` | Kopftreffer-Faktor |
| `fireRate` | `FiringRate` | Schuss je Sekunde. Bei Feuerstoß-Waffen zusätzlich `BurstFiringRate` im Bericht nennen |
| `magazine` | `ClipSize` | |
| `reloadTime` | `ReloadTime` | Sekunden |
| `structureDamage` | `EnvDmgPB` | Schaden an Gebäuden |

**Was du prüfen musst (nicht sicher):**

- Ob `DmgScale`, `ReloadScale`, `ClipScale`, `ROFScale` oder ein `DmgScaleTableRow` (Kurventabelle) den Wert noch verändern. Wenn ja und ≠ 1: den **wirklich im Spiel geltenden** Wert ausgeben (Grundwert × Faktor) und im Bericht nennen.
- Ob es Schadensabfall gibt (`DmgMid`, `DmgLong`, `RngPB`, `RngMid`, `RngLong`). Das brauchen wir noch nicht in der JSON – aber bitte im Bericht erwähnen, falls vorhanden.
- **Gegenprobe**: Nimm 2–3 bekannte Waffen und vergleiche Schaden/Magazin mit dem, was man im Spiel sieht (Inventar-Ansicht). Stimmen sie nicht, nicht ausgeben, sondern melden.
- `dps` **nicht** selbst ausrechnen – die Seite rechnet `damage × pellets × fireRate` und kennzeichnet das als „calc.“. Nur wenn das Spiel selbst einen DPS-Wert führt, ihn als `dps` ausgeben.

**Zusätzliche Felder (optional, aber die Einzelwaffen-Seite und der Vergleich zeigen sie, sobald sie da sind):**

| JSON-Feld | Quelle | Sicherheit |
|---|---|---|
| `equipTime` (Pullout, s) | `EquipAnimRate` bzw. Ausrüst-Zeit der Waffe | **prüfen** – evtl. nur als Animationsrate vorhanden; dann weglassen |
| `adsTime` (s) | `ADSTransitionInTime` (FFortRangedWeaponStats) | Feld sicher vorhanden |
| `spread` | `Spread` (Hüfte); `SpreadDownsights` im Bericht nennen | Feld sicher, Bedeutung = Rohwert |
| `recoilVertical` / `recoilHorizontal` | `RecoilVert` / `RecoilHoriz` | Feld sicher, Rohwert |
| `falloff` | `RngPB/RngMid/RngLong/RngMax` (Reichweiten in **cm** → Meter /100) mit `DmgPB/DmgMid/DmgLong/DmgMaxRange` → je Punkt `{ "distance": m, "factor": Dmg/DmgPB }` | Felder sicher; ob das Spiel heute stattdessen eine Kurve (`DmgScaleTableRow`) nutzt: **prüfen** |
| `description` (pro Waffe) | `ItemDescription` der WID (englisch) | sicher |
| `modes` (pro Waffe) | in welchen Playlists die Waffe Loot-Chance > 0 hat: `br`, `zb`, `reload`, `blitz`, `og`, `ranked` | aus Schritt 3 pro Playlist ableiten |

Spezialwaffen (Mythic, Exotic, Boss-/NPC-Waffen) gehören dazu, mit ihrer echten Seltenheit. Creative-Waffen-IDs (falls verschieden) in den Bericht.

### Schritt 3 – Fundchancen (Boden / Truhe)

**3a – Welche Tabellen gelten (prüfen!):**
- Grundtabellen: `FortniteGame/Content/Items/Datatables/AthenaLootTierData_Client` und `AthenaLootPackages_Client` (sicher, gibt es seit Jahren).
- Die Playlist (`FortPlaylistAthena`) hat eigene Felder **`LootTierData`** und **`LootPackages`** – wenn gesetzt, gelten diese.
- GameFeature-Plugins können Loot einspeisen: im `FortGameFeatureData` des Plugins stehen **`DefaultLootTableData`** (LootTierData + LootPackageData) und **`PlaylistOverrideLootTableData`** (pro Playlist-Tag). Alle für die aktive BR-Playlist geltenden Tabellen zusammenführen (Zeilen gleicher Namen: die Override-Zeile gewinnt – im Bericht vermerken, wie du es gemacht hast).

**3b – Aufbau (sicher, aus `FFortLootTierData` / `FFortLootPackageData`):**
- *LootTierData*-Zeile: `TierGroup` (z. B. Truhe/Boden), `Weight`, `LootPackage` (Name), `NumLootPackageDrops`, `LootPackageCategoryWeightArray`, `…MinArray`, `…MaxArray`.
- *LootPackages*-Zeile: `LootPackageID`, `Weight`, `Count`, `LootPackageCategory`, `LootPackageCall` (Verweis auf ein weiteres Paket) oder `ItemDefinition` (die WID).

**3c – Rechnung (so ausrechnen, nicht simulieren):**
1. Für eine TierGroup (z. B. Boden): alle Zeilen dieser Gruppe nehmen, Wahrscheinlichkeit je Zeile = `Weight / Summe(Weight)`.
2. Von dort `LootPackage` → alle Paket-Zeilen mit diesem `LootPackageID`; je Kategorie eine gewichtete Auswahl (`Weight`). Steht in einer Zeile `LootPackageCall`, rekursiv in das genannte Paket weiter (wieder gewichtet), bis eine `ItemDefinition` (WID) erreicht ist.
3. Ergebnis je WID: **Wahrscheinlichkeit in Prozent, dass ein einzelner Bodenspawn bzw. eine einzelne Truhe diese Waffe in dieser Seltenheit enthält.**
4. Zeilen mit `Weight = 0` ignorieren. `NamedWeightMult`/`RequiredTag`/`GameplayTags` beachten, falls gesetzt; wenn unklar, im Bericht nennen.
5. Gegenprobe: Summe aller Waffen-Chancen im Boden darf nicht über 100 % liegen (Rest = Munition, Heilung, Mats, nichts).

Gebrauchte Quellen (Schlüssel in `loot`): `floor` (Bodenloot), `chest` (normale Truhe), und wenn eindeutig: `rareChest`, `supplyDrop`, `ammoBox`, `fishing`, `vault`, `lootCannon`, `boss`. Unbekannte weitere Quellen dürfen mit eigenem Schlüssel rein (die Seite zeigt sie trotzdem).

**Pro Modus:** Wenn die Zeit reicht, dieselbe Rechnung für jede BR-Playlist (Build, Zero Build, Reload, Blitz, OG, Ranked) – dann je Modus eine eigene Datei `waffen-<modus>.json` im selben Format (z. B. `waffen-reload.json`) und in `waffen.json` bei jeder Waffe `modes` setzen.

### Schritt 4 – Ausgabe `waffen.json`

Pfad im Hub: **`public/hub-daten/waffen.json`**. Genau dieses Format (Version 1). Prozentzahlen 0–100, Zeiten in Sekunden, Englisch für Namen.

```json
{
  "format": 1,
  "season": 43,
  "build": "++Fortnite+Release-xx.xx-CL-12345678",
  "exportedAt": "2026-11-27T12:00:00Z",
  "playlist": "Playlist_DefaultSolo",
  "weapons": [
    {
      "id": "assault_heavy_recoil",
      "name": "Hammer Assault Rifle",
      "class": "ar",
      "icon": "/hub-daten/icons/assault_heavy_recoil.png",
      "ammo": "Medium Bullets",
      "blueprints": ["B_Assault_Heavy_Recoil_Athena_C"],
      "rarities": [
        {
          "rarity": "rare",
          "wid": "WID_Assault_Heavy_Recoil_Athena_R",
          "statsRow": "<DataTable>.<RowName>",
          "damage": 0,
          "pellets": 1,
          "headshotMultiplier": 0,
          "fireRate": 0,
          "magazine": 0,
          "reloadTime": 0,
          "structureDamage": 0,
          "loot": { "floor": 0, "chest": 0 }
        }
      ],
      "loot": { "floor": 0, "chest": 0 }
    }
  ]
}
```
(Die Nullen sind Platzhalter – echte Werte eintragen.)

Regeln zu den Feldern:
- `id`: klein geschrieben, aus dem WID-Namen **ohne** `WID_`, ohne `_Athena`, ohne Seltenheitskürzel (`_C/_UC/_R/_VR/_SR/_UR`) und ohne `_Ore_T0x`. Beispiel: `WID_Assault_Heavy_Recoil_Athena_R` → `assault_heavy_recoil`. Alle Seltenheiten einer Waffe kommen unter **eine** `id`.
- `class`: eine von `ar`, `shotgun`, `smg`, `pistol`, `sniper` (auch DMR), `launcher`, `melee`, `throwable`, `special`. Aus Waffenart/Tags ableiten; bei Unsicherheit `special` und im Bericht nennen.
- `icon` (optional): `LargePreviewImage` als PNG nach `public/hub-daten/icons/<id>.png` exportieren (max. 256 px, nicht hochskalieren). Ohne Bild Feld weglassen – die Seite hat eigene Symbole.
- `blueprints` (optional, aber sehr hilfreich): der Waffen-Blueprint (Klassenname `B_…_C` bzw. was im Replay steht). Damit verbindet die Seite die Waffe mit unseren Turnierwerten.
- `rarities`: nur Seltenheiten, die es **wirklich** gibt. `rarity` als `common|uncommon|rare|epic|legendary|mythic|exotic`.
- `loot` je Seltenheit: Chancen dieser Seltenheit. `loot` auf Waffenebene (optional): alle Seltenheiten zusammen.
- Nur Waffen aufnehmen, die im aktuellen BR-Loot-Pool sind (Chance > 0 in irgendeiner Gruppe) **oder** im Bericht begründen, warum zusätzlich (z. B. Boss-/Tresor-Waffe).

### Schritt 4b – Änderungen zwischen zwei Exporten (`changes`)

Beim **zweiten und jedem weiteren** Export: die neue `waffen.json` mit der vorherigen vergleichen und jede Abweichung als Zeile in `changes` schreiben (die alten Zeilen behalten, neue oben dazu):

```json
"changes": [
  { "date": "2026-12-05", "build": "44.00", "weaponId": "assault_heavy_recoil", "rarity": "rare", "field": "damage", "from": 30, "to": 29, "modes": ["br"] },
  { "date": "2026-12-05", "build": "44.00", "weaponId": "shotgun_coredps", "rarity": "epic", "field": "floor", "from": 0.5, "to": 0.8 },
  { "date": "2026-12-05", "build": "44.00", "weaponId": "pistol_new", "field": "added", "from": null, "to": "in pool" }
]
```
`field` = Name des JSON-Felds (`damage`, `fireRate`, …) oder der Loot-Quelle (`floor`, `chest`, …); für neue/entfernte Waffen `added` / `removed`. Die alte Datei vorher als `waffen-<build>.json` aufheben.

### Schritt 5 – Ausgabe `objekte.json` (Karten-Objekte)

Pfad im Hub: **`public/hub-daten/objekte.json`** (die Probedatei `objekte-beispiel.json` bleibt daneben liegen; sobald `objekte.json` da ist, nimmt die Karte diese). Format (die Karte liest es schon):

```json
{
  "saison": 43,
  "build": "++Fortnite+Release-xx.xx-CL-12345678",
  "exportedAt": "2026-11-27T12:00:00Z",
  "objekte": [
    { "typ": "chest",    "x": 0, "y": 0, "z": 0 },
    { "typ": "chest",    "x": 0, "y": 0, "z": 0, "chance": 0.5 },
    { "typ": "zipline",  "x": 0, "y": 0, "z": 0, "x2": 0, "y2": 0 },
    { "typ": "vending",  "x": 0, "y": 0, "z": 0, "name": "Optional label" }
  ]
}
```
- **Kein** `"probe": true` setzen (das markiert Testdaten auf der Karte).
- `typ` – die Karte kennt diese Ebenen (eigene Symbole je Typ, gruppiert wie in der Seitenleiste):
  - Loot: `vault`, `chest`, `buried` (vergrabene Truhe), `rarechest`, `lootcannon`, `ammo`
  - Sprites: `spritechest`, `wanted` (Steckbrief), `extraction`
  - Movement: `launchpad`, `cannon`, `zipline`, `portapotty`, `whirlpool`
  - Vehicles: `sportscar`, `suv`, `boat`, `tires` (Offroad-Reifen), `service` (Tankstelle/Werkstatt)
  - Healing: `campfire`, `produce` (Obstkiste), `slurp` (Fass), `slurptruck`
  - Fishing: `fishingrod` (Angel-Fass), `fishing` (Angelstelle)
  - NPCs: `npc` (mit `name` = Figurenname; Händler/Anheuern im `name` oder Bericht)
  - Other: `reboot`, `vending`, `bush`; alles andere `other`
- Bei Tresoren, die einen Schlüssel brauchen: `"name": "needs key"` o. ä.
- `x`, `y`, `z`: **Unreal-Weltkoordinaten in cm**, wie im Spiel (dieselben Koordinaten, die Epic für die POIs liefert). Ganze Zahlen reichen.
- `x2`, `y2`: nur bei Ziplines – der zweite Endpunkt (Spline-Ende / zweiter Pfosten).
- `chance` (optional, 0..1): wenn das Objekt nur mit einer Wahrscheinlichkeit erscheint (z. B. Truhen-Spawnchance), sonst weglassen.
- `name` (optional): nur wenn das Spiel einen Namen führt.

**Wie finden (prüfen!):**
- Die BR-Hauptkarte ist eine **World-Partition**-Karte. Die Actors stecken in vielen Zell-Paketen (Ordner `…/_Generated_/` unter der Karte) und in **Level-Instanzen** (Gebäude-Vorlagen, die mehrfach platziert sind). Alle durchgehen.
- Klassen (Beispiele, sicher seit Jahren vorhanden – aber Namen der aktuellen Saison in Schritt 1 bestätigen): `Tiered_Chest_Athena_C` (Truhe), `Tiered_Ammo_Athena_C` (Munitionskiste). Slurp-Fass, Reboot-Van, Startrampe, Zipline, Automat, Angelstelle: Klassennamen aus der Liste in Schritt 1 nehmen.
- **Position = vollständige Welt-Transformation**: `RootComponent.RelativeLocation` des Actors **plus** alle übergeordneten Transformationen (Level-Instanz-Position, -Drehung, -Skalierung; Attach-Parent). Nur `RelativeLocation` allein ist bei Level-Instanzen falsch!
- Doppelte (gleiche Klasse, < 50 cm Abstand) zusammenfassen.
- **Werkzeuge, die das schon können (CUE4Parse-basiert, prüfen welches mit dem aktuellen Build läuft):** CUE4Parse direkt (C#), CUE4Parse.CLI (exportiert .umap-Listen als JSON), UnrealExporter (Batch-Export .umap → JSON), BlenderUmap2 (exportiert .umap-Actors samt Transformationen). Es gibt keine fertige öffentliche Liste der Truhen – fortnite.gg rechnet sie selbst aus genau diesen Dateien, deshalb geht es **ab dem ersten Tag einer Season** (nicht erst nach Spielen).
- **Spawnchance pro Truhe (wichtig, Betreiber: "die Chance ist immer gleich, auch wo sie keiner öffnet"):** Nicht jede platzierte Truhe erscheint in jeder Runde. Die Wahrscheinlichkeit steht in den Spieldaten, nicht in Replays: am Actor bzw. seiner Blueprint-Vorlage (Properties wie Spawn-/Erscheinungs-Chance, Spawner-/Gruppen-Actor, der aus N Plätzen M auswählt) – genaue Property-Namen in Schritt 1 finden und melden. Pro Truhe `chance` (0..1) setzen; bei Gruppen („2 von 5 Plätzen“) jedem Platz `chance = M/N` und zusätzlich `"gruppe": "<id>"`.
- **Bei jedem Update neu exportieren** (Saisonstart und jedes Patch-Update), mit `build` in der Datei – die Karte zeigt den Stand an.
- Nur die BR-Insel – keine Lobby-/Test-/Kreativ-Teilkarten, keine Objekte, die nur in einem Event-Modus auftauchen (im Bericht nennen, wenn unklar).

**Gegenprobe Karte:** Nimm 3 Truhen an bekannten Orten (z. B. in einem benannten POI), schau im Hub auf **Community → Map** nach, ob die Symbole am richtigen Haus liegen. Liegen alle um denselben Betrag verschoben, ist eine Transformation vergessen worden.

### Schritt 5b – Bilder aller Waffen und Gegenstände (`assets.json` + PNGs)

Für das **Asset Studio** (`/community/assets`) und schärfere Waffenbilder:

1. Für **jede Waffe und jeden Gegenstand** (Waffen aller Klassen inkl. Bögen, DMR, Sprengstoff, Nahkampf; außerdem Verbrauchsgüter, Items, Fallen, Medaillons, Boons, Währung, Materialien, Fahrzeuge, Behälter, Objekte, Kreaturen) die Textur aus `LargePreviewImage` (sonst `SmallPreviewImage` / `Icon`) als **PNG mit Alpha-Kanal** exportieren – in Originalgröße, nicht hochskalieren.
2. Pro Seltenheit, wenn sich das Bild unterscheidet (sonst ein Bild pro Waffe).
3. Dateiname = Item-ID klein, z. B. `public/hub-daten/assets/assault_heavy_recoil.png` bzw. `assault_heavy_recoil_epic.png`.
4. Manifest `public/hub-daten/assets.json`:
```json
{ "build": "++Fortnite+Release-xx.xx-CL-…", "assets": [
  { "id": "assault_heavy_recoil", "name": "Hammer Assault Rifle", "class": "ar", "rarity": "rare", "season": "C7S4", "image": "/hub-daten/assets/assault_heavy_recoil.png" }
] }
```
`class` aus: `ar`, `shotgun`, `smg`, `pistol`, `sniper`, `bow`, `marksman`, `explosive`, `melee`, `consumable`, `item`, `trap`, `medallion`, `boon`, `currency`, `material`, `vehicle`, `container`, `object`, `creature`. `season` = Saison, in der das Item zuerst in den Dateien auftauchte (wenn bekannt, sonst weglassen).
Gesamtgröße im Blick behalten (eine Waffe ~50–300 KB); bei sehr vielen Bildern lieber nur die aktuellen Saisons plus alle Waffen.

### Schritt 5d – Original-Kartensymbole (`icons/karte/<typ>.png`)

Der Betreiber will auf **Community → Map** die **Original-Symbole aus dem Spiel** (wie fortnite.gg) statt der selbst gezeichneten Abzeichen. Die Karte nimmt automatisch `public/hub-daten/icons/karte/<typ>.png`, sobald die Datei da ist – fehlt eine, bleibt das eigene Abzeichen als Ersatz.

1. **Suchen** (nicht raten, erst auflisten): Texturen der Karten-/Minimap-Marker. Typische Orte – **prüfen**: `FortniteGame/Content/UI/…` (Unterordner mit `Minimap`, `Map`, `MapIcons`, `Markers`, `Compass`, `Icons`), dazu `FortniteGame/Plugins/GameFeatures/<Name>/Content/UI/…` für saisonale Objekte. Namen enthalten meist `Minimap`, `MapIcon`, `Map_Icon`, `Marker` (z. B. `T_UI_…Minimap…Chest…`). Gegenprobe: Die Kartenmarker-Definitionen der Objekte (Actor-Klassen aus Schritt 1, Felder wie `MinimapIcon`, `MapIcon`, `MarkerIcon`, `IndicatorBrush`) zeigen auf genau die Textur, die das Spiel benutzt – diesem Verweis folgen hat Vorrang vor der Namenssuche.
2. **Exportieren** als **PNG mit Alpha**, Originalgröße (nicht hochskalieren), quadratisch zugeschnitten, wenn nötig mit transparentem Rand. Eine Datei je Typ, Dateiname exakt nach dieser Liste (das sind die Ebenen der Karte):
   `vault`, `chest`, `buried`, `rarechest`, `lootcannon`, `ammo`, `spritechest`, `wanted`, `extraction`, `launchpad`, `cannon`, `zipline`, `portapotty`, `whirlpool`, `sportscar`, `suv`, `boat`, `tires`, `service`, `campfire`, `produce`, `slurp`, `slurptruck`, `fishingrod`, `fishing`, `npc`, `reboot`, `vending`, `bush`.
   Ziel: `public/hub-daten/icons/karte/chest.png`, `…/ammo.png`, `…/slurp.png` usw. Was es in dieser Saison nicht gibt oder wofür kein Original-Symbol existiert, einfach weglassen.
3. **Nur lokal** (`.gitignore` deckt `public/hub-daten/icons/` ab) – nicht committen, nicht pushen.
4. Im **Bericht**: je Typ die Quell-Textur (voller Pfad) und woher die Zuordnung kommt (Verweis aus der Actor-Klasse oder nur Namenssuche).

### Schritt 5e – 3D-Ansicht der Insel in den Hub kopieren (`3d/index.html`)

Der Betreiber (27.11.2026): „Wo ist die 3D?“ – die Karte im Hub (**Community → Map**) hat oben einen Umschalter **2D / 3D**. „3D“ zeigt deine fertige 3D-Ansicht der Insel in einem Rahmen, sobald sie im Hub-Ordner liegt. Der Hub baut selbst keine 3D-Karte – er lädt nur deine.

1. **Fertige Ansicht bauen** (falls sie noch als Entwicklungsstand läuft): ein statischer Ordner mit `index.html` und allem, was sie braucht (Skripte, Modelle, Texturen). Alle Pfade **relativ** (`./assets/…`, nicht `/assets/…`), damit die Ansicht in einem Unterordner läuft. Bei Vite: `base: './'` setzen und `npm run build` – der Inhalt von `dist/` ist die fertige Ansicht.
2. **Kopieren** nach `%USERPROFILE%\CompHubHub\public\hub-daten\3d\` – so dass `…\hub-daten\3d\index.html` existiert, die übrigen Dateien daneben bzw. in Unterordnern. Vorher den alten Inhalt des Ordners löschen.
3. **Prüfen**: `http://localhost:5173/hub-daten/3d/index.html` im Browser öffnen – die Insel muss ohne Fehler in der Konsole erscheinen. Dann im Hub **Community → Map → 3D**.
4. **Nur lokal** (`.gitignore` deckt `public/hub-daten/3d/` ab) – nicht committen, nicht pushen. Nach jeder Änderung an der 3D-Ansicht Schritt 1–2 wiederholen; im Hub reicht ein Neuladen.
5. Im **Bericht**: Größe des Ordners, ob die Ansicht ohne Internet läuft und ob etwas fehlt (z. B. Texturen, die nicht mitkopiert wurden).

### Schritt 5c – Saison, Rotation und sonstige Daten (nur was sicher in den Dateien steht)

- **`public/hub-daten/saison.json`**: `{ "season": 43, "name": "…", "sub": "Chapter 7 · …", "start": ISO, "end": ISO, "endConfirmed": true|false, "liveEvent": { "name", "doorsOpen", "start" }?, "modes": [{ "mode", "title", "end" }]?, "xpPerMinute": [{ "mode", "title", "xp", "weeklyLimit" }]?, "history": [{ "chapter", "season", "name", "start", "end", "battlePass" }]? }`. Saisonzeiten stehen evtl. im Kalender-/Timeline-Teil der Spieldaten (`…Calendar…`, `SeasonData`/`AthenaSeasonItemDefinition` – **prüfen**). XP pro Minute je Modus nur, wenn als Wert in den Dateien (Playlist-XP, `XPPerMinute` o. ä.) – sonst weglassen. Battle-Pass-Stufen (`AthenaSeasonItemDefinition` → Stufen/XP je Level) gern in den Bericht.
- **`public/hub-daten/rotation.json`**: `{ "modes": { "reload": { "anchor": ISO-Startzeit eines bekannten Fensters, "slotMinutes": 20, "maps": [{ "name", "image"? }] }, "blitz": { … } } }`. Die Kartenreihenfolge steht ggf. in den Playlist-/Rotations-Daten (`…Rotation…`, `PlaylistRotation`, Map-Varianten der Reload-Playlist – **prüfen**); fehlt sie, kann der Betreiber sie einmal im Spiel ablesen.
- **Zonen-Phasen** (für die Karte später): Phasen mit Radius, Wartezeit, Schrumpfzeit, Schaden – aus der Sturm-/Zonen-Tabelle der Playlist (`…StormCircle…`/`Safe Zone`-Daten, **prüfen**) → `public/hub-daten/zonen.json` mit `[{ "phase", "radius", "wait", "shrink", "damage" }]`.
- **Ranked/Turniere**: Rangstufen, Punkte je Platzierung und Kill, falls in den Dateien (nur Bericht – die Turnierdaten kommen bereits von Epics Events-API auf der Seite).
- **Sprites / Schatzsuche / Quests** (niedrige Priorität): Sprite-Liste mit Varianten, Schatzsuche-Belohnungen mit Drop-Chance „1 in N“, Quest-Definitionen mit Belohnungen – nur im Bericht auflisten, Format machen wir danach.

### Schritt 6 – Abliefern

1. Beide Dateien als gültiges JSON speichern (UTF-8, ohne Kommentare). Kurz prüfen: `node -e "JSON.parse(require('fs').readFileSync('public/hub-daten/waffen.json','utf8'))"`.
2. Nur lokal speichern (Ordner `%USERPROFILE%\CompHubHub\public\hub-daten\`). **Nicht** committen oder pushen – der Hub im Browser liest die Dateien direkt; ein Neuladen reicht.
3. **Bericht** an den Betreiber (kurz, deutsch): Build, Playlist, welche Tabellen benutzt wurden, Anzahl Waffen/Seltenheiten/Objekte je Typ, alles was unsicher war oder weggelassen wurde, Ergebnis der Gegenproben.

### Was sicher ist und was nicht – Überblick

| Sicher (Strukturen/Felder bekannt) | Muss geprüft werden |
|---|---|
| `WID_…` hat `WeaponStatHandle`, `Rarity`, `ItemName`, `LargePreviewImage`, `AmmoData` | Welche Stat-Tabelle konkret (dem Handle folgen, nicht raten) |
| Stat-Felder `DmgPB`, `EnvDmgPB`, `DamageZone_Critical`, `FiringRate`, `BurstFiringRate`, `ClipSize`, `ReloadTime`, `BulletsPerCartridge` | Ob Skalierungsfaktoren/Kurven den Wert ändern; Feldnamen können sich mit einem Build ändern → Mappings! |
| Loot-Tabellen `AthenaLootTierData_Client` / `AthenaLootPackages_Client` mit `TierGroup`, `Weight`, `LootPackage`, `LootPackageCall`, `ItemDefinition` | Welche TierGroup Boden/Truhe ist; Playlist- und GameFeature-Overrides für die aktuelle Saison |
| `FortGameFeatureData` hat `DefaultLootTableData` und `PlaylistOverrideLootTableData` | Wie Overrides genau zusammengeführt werden |
| Truhe `Tiered_Chest_Athena_C`, Munition `Tiered_Ammo_Athena_C` | Klassennamen der übrigen Objekte dieser Saison; Welt-Transformation bei Level-Instanzen |

Quelle für die Feldnamen: öffentliche Header-Nachbildung des Spiels (FortniteModdingHub/FNGameProj: `FortBaseWeaponStats.h`, `FortRangedWeaponStats.h`, `FortLootTierData.h`, `FortLootPackageData.h`, `FortGameFeatureLootTableData.h`, `FortWeaponItemDefinition.h`). Der Stand dieser Nachbildung kann älter sein als der aktuelle Build – deshalb immer gegen die echten Dateien und Mappings prüfen.
