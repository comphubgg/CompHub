# 📝 Daten-Editor System - Dokumentation

## Überblick

Du hast jetzt ein vollständiges **Daten-Persistierungs-System** eingebaut, mit dem du deine Daten live bearbeiten kannst. Alle Änderungen werden **direkt in den JSON-Dateien gespeichert** und bleiben auch nach einem Server-Neustart erhalten.

## ✨ Wie es funktioniert

### 1. **Edit-Data Panel** (`/admin`)
- Klicke auf den neuen **"✏️ Edit Data"** Button auf der Hauptseite
- Du gelangst zu einem Admin-Panel, wo du alle Daten bearbeiten kannst:
  - **Streamers**: Twitch- und Twitter-Namen ändern/löschen (EU & NA)
  - **Players**: Spieler-Namen, Regionen und Twitter-Handles bearbeiten
  - **Notes**: Notizen anzeigen und löschen

### 2. **Änderungen speichern**
Wenn du einen Eintrag bearbeitest:
1. Klick auf das **"✎ Edit"** Button
2. Bearbeite die Felder
3. Klick **"✓ Save"**
4. Die Änderungen werden sofort in die Datei geschrieben (✓ Data saved: Dateiname)

### 3. **Daten löschen**
- Klick auf **"🗑 Delete"** neben einem Eintrag
- Bestätige die Bestätigung
- Der Eintrag wird aus der Datei entfernt

## 🗂️ Dateien & Struktur

### Neue/erweiterte Dateien:

```
app/
├── lib/
│   └── dataManager.ts          # Zentrale Datenverwaltungs-Utility
├── components/
│   ├── DataEditor.tsx          # Modal zum Bearbeiten
│   └── QuickEditItem.tsx        # Inline-Editor für List-Items
├── admin/
│   └── page.tsx                # Admin-Panel für alle Datentypen
└── api/
    ├── players/route.ts        # GET, POST, PATCH, DELETE
    ├── streamers/route.ts       # GET, POST, DELETE, PUT
    └── notes/route.ts           # GET, POST, PUT, DELETE

data/
├── players.json                # Spieler-Daten (Region, Twitter)
├── streamers.json              # Streamer-Daten (Twitch, Twitter)
├── notes.json                  # Notizen
└── ...
```

## 🔄 API-Endpoints (für Developer)

Alle Endpoints speichern Daten automatisch:

### Players
```
GET  /api/players                    # Alle Spieler abrufen
POST /api/players                    # Neuen Spieler hinzufügen
PATCH /api/players                   # Spieler bearbeiten (Name/Twitter)
DELETE /api/players                  # Spieler löschen
```

### Streamers
```
GET  /api/streamers                  # Alle Streamer abrufen
POST /api/streamers                  # Neuen Streamer hinzufügen
PUT  /api/streamers                  # Streamer bearbeiten (Twitter)
DELETE /api/streamers                # Streamer löschen
```

### Notes
```
GET  /api/notes                      # Alle Notizen abrufen
POST /api/notes                      # Neue Notiz erstellen
PUT  /api/notes                      # Notiz aktualisieren
DELETE /api/notes?id=<id>            # Notiz löschen
```

## 💾 Daten-Persistierung

### So funktioniert das Speichern:

1. **Frontend sendet Änderung** → API-Endpoint
2. **API liest aktuelle Datei** aus `data/` Ordner
3. **API ändert die Daten** im Speicher
4. **API schreibt neue Datei** mit `writeDataFile()`
5. **Datei ist gespeichert** → Auf alle Computer verfügbar

### Die Zentrale Utility (`app/lib/dataManager.ts`):
- `readDataFile()` - Liest JSON-Dateien
- `writeDataFile()` - Speichert Änderungen
- `updateDataField()` - Ändert ein Feld
- `addToArrayField()` - Fügt zu Array hinzu
- `removeFromArrayField()` - Entfernt aus Array

## 🚀 Workflow (Praktisches Beispiel)

### Beispiel: Streamer hinzufügen
```
1. Öffne http://localhost:3000/admin
2. Gehe zur "STREAMERS" Tab
3. Bearbeite einen Streamer oder füge einen neuen via API hinzu
4. Klick "Save"
5. ✓ Data saved: streamers.json
6. Wechsel zu anderem Computer → Daten sind dort auch aktualisiert!
```

### Beispiel: Twitter-Namen ändern
```
1. Admin Panel öffnen
2. Spieler/Streamer-Tab
3. "✎ Edit" klicken
4. Twitter-Namen ändern
5. "✓ Save"
6. Fertig! Änderung ist persistent gespeichert
```

## ⚠️ Wichtig

- **Alle Änderungen sind sofort persistent** - Keine "Save" Buttons nötig
- **Auf allen Computern gleich** - Nutze den gleichen Server/Ordner
- **JSON-Dateien** sind das Backend - Keine Datenbank nötig
- **Server-Neustart** = Daten bleiben erhalten ✓

## 🛠️ Erweiterung

Wenn du weitere Datentypen hinzufügen willst:

1. **Erstelle neue API Route**: `app/api/deinDatentyp/route.ts`
2. **Nutze `dataManager.ts`**: 
   ```typescript
   import { readDataFile, writeDataFile } from '@/app/lib/dataManager';
   ```
3. **Füge Edit-Form im Admin Panel hinzu**

## 📞 Fehlerbehandlung

Das System loggt Fehler in die Console:
- `✓ Data saved: dateiname.json` = Erfolgreich
- `Error reading dateiname.json` = Lesefehler
- `Failed to update dateiname.json` = Schreibfehler

Wenn etwas nicht speichert, schau in der Browser-Console oder Server-Logs nach.

---

**Viel Erfolg beim Bearbeiten deiner Daten! 🎉**
