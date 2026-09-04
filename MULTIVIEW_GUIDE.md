# 📺 Multiview Dashboard - Komplette Anleitung

## 🎯 Schnelleinstieg - Multiview aktivieren

1. **🖥️ Single ↔ Multiview wechseln**: Klick auf den Button oben rechts `👤 Single` / `🖥️ Multiview`
   - **Single Mode**: Nur ein Stream (normales TV-Gefühl)
   - **Multiview Mode**: Mehrere Streams gleichzeitig

---

## ➕ Streamer hinzufügen / entfernen

### In der Stremer-Liste (LINKS):

```
🔴 Streamer-Liste
├─ vadeal        (Live, 1.2k viewer)  [➕] ⭐ 👁️ 🗑️
├─ skyfnrr       (Offline)            [➕] ☆ 👁️ 🗑️
└─ praxfnr_      (Live, 856 viewer)   [✕] ⭐ 👁️ 🗑️
```

### Was die Buttons bedeuten:

| Button | Bedeutung | Aktion |
|--------|-----------|--------|
| **➕** | Nicht in Multiview | Klick = Hinzufügen |
| **✕** | Schon in Multiview | Klick = Entfernen |
| **⭐** / **☆** | Favorit | Als Favorit speichern |
| **👁️** | Sichtbar | Streamer verbergen/zeigen |
| **🗑️** | Delete | Aus Ordner löschen |

---

## 🎮 Multiview Layout - Wie es funktioniert

### Layout-Struktur:

```
┌──────────────────────────────────────────────────────────┐
│                     HAUPTSTREAM                          │
│                  (aktiv angeschaut)                      │
│                   (GROSS, 75% Höhe)                      │
│                                                          │
│  🟥 vadeal (1.2k viewers)                                │
└──────────────────────────────────────────────────────────┘
              ↕️ HIER KANN MAN ZIEHEN! ↕️
┌──────────────────────────────────────────────────────────┐
│  Kleine Streams (Grid, 25% Höhe)                         │
│                                                          │
│  🔴 skyfnrr    🔴 praxfnr_   ⚫ ghonzo   ⚫ velofps     │
│  (Live)        (Live)         (Offline) (Offline)       │
│  [✕]           [✕]            [✕]       [✕]            │
│                                                          │
│  Klick auf ein kleines Video = wird zum Hauptstream     │
└──────────────────────────────────────────────────────────┘
```

---

## 🖱️ Layout-Größen verändern - So funktioniert's:

### 1️⃣ **Resize-Handle benutzen**:
```
HAUPTSTREAM (Größer machen)
    ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
    ↕️ ← HIER ZIEHEN! (Grauer/Purple Balken)
    ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
kleine Streams (Kleiner machen)
```

- **Maaus drauf hover** → Balken wird purple
- **Klick + Ziehen** → Layout ändert sich
- **Position gespeichert** ✅ Nächste Session gleich

---

## 🔔 Notifications - Fake Demo

### Szenario: "Streamer kommt live"

```javascript
// BEFORE: Offline
✓ vadeal    (Offline ⚫)

// Streamer kommt live...
```

**Browser Notification:**
```
🔴 vadeal ist live!
├─ Zeitstempel: Gerade eben
├─ Aktion: Klick → Zu Stream
└─ Sound: "ping!" 🔔
```

**In-App Toast (unten rechts):**
```
┌─────────────────────────────┐
│ 🔴 vadeal ist jetzt LIVE!   │
│                             │
│ 📊 Zuschauer: 1.245         │
│ 🎮 Category: Fortnite       │
│                             │
│ [Zum Stream] [Ignorieren]   │
└─────────────────────────────┘
```

### Notifications aktivieren:
1. Oben im Browser: 🔔 Symbol
2. "Erlauben" klicken
3. Dann werden Sie benachrichtigt wenn Favorit-Streamer live gehen

---

## 📋 Praktische Beispiele

### Beispiel 1: "Ich will 3 Streams schauen"

```
1. 🖥️ Multiview Button klicken
2. Links im Streamer-Panel:
   - vadeal hinzufügen (➕ klicken)
   - skyfnrr hinzufügen (➕ klicken)
   - praxfnr_ hinzufügen (➕ klicken)
3. Multiview zeigt:
   - GROSS: vadeal (1.2k zuschauer)
   - Klein: skyfnrr, praxfnr_
4. Auf "skyfnrr" klicken → wird groß
5. Größe mit Resize-Handle anpassen
```

### Beispiel 2: "Streamer aus Multiview entfernen"

```
1. Hose über "skyfnrr" in der Liste (links)
2. Button ✕ erscheint (rot)
3. Klick auf ✕
4. Weg aus der Multiview! ✅
```

### Beispiel 3: "Dynamisch zwischen Streams wechseln"

```
Multiview aktiv mit: [vadeal, skyfnrr, praxfnr_]

- Klick auf "skyfnrr" (klein) → wird Hauptstream
- Jetzt: [skyfnrr groß + vadeal + praxfnr_ klein]
- Klick auf "vadeal" → wieder vadeal groß
```

---

## ⚙️ Einstellungen & Verhalten

### Auto-Save:
- Layout-Größe ✅ Gespeichert
- Multiview-Streamer ✅ Gespeichert
- Aktiver Streamer ✅ Gespeichert
- Beim nächsten Besuch → Alles wie zuvor!

### Performance:
- **Maximal 6 Streams** gleichzeitig (iFrame Limits)
- **Chat** kann deaktiviert werden (💬 Button)
- **Jeder Stream** eigenständiger Player

### Tastaturkürzel (zukünftig):
- `M` = Multiview toggle
- `C` = Chat toggle  
- `←` / `→` = Stream wechseln

---

## 🎨 UI-Farben erklärt

| Farbe | Bedeutung |
|-------|-----------|
| 🟥 **Red** | LIVE Streams |
| ⚫ **Grau** | Offline Streams |
| 🟪 **Purple** | Aktiv / Selected |
| 🟡 **Gelb** | Favorit (⭐) |

---

## 🐛 Häufige Probleme

### Problem: "Streamer lässt sich nicht hinzufügen"
**Lösung:**
1. Multiview-Mode aktiviert? (🖥️ Button)
2. Streamer existiert? (In Liste sichtbar?)
3. Browser-Konsole (F12) auf Fehler checken

### Problem: "Layout sieht komisch aus"
**Lösung:**
- Seite neu laden (F5)
- Größe mit Resize-Handle zurücksetzen

### Problem: "Chat funktioniert nicht"
**Lösung:**
1. Popup-Blocker deaktivieren
2. Parent Domain prüfen: `localhost:3001`
3. Twitch Status checken

---

## 📱 Mobile / Tablet

### Multiview auf Mobile?
- **Nur 2 Streams** gleichzeitig möglich
- Layout: Vertikal gestapelt
- Resize-Handle: Touch-friendly
- Empfohlen: Auf großem Screen nutzen (Desktop/Laptop)

---

## 🚀 Advanced: Streamers schnell organisieren

### Favorit-System:
```
⭐ Favoriten = Bekommen Notifications
☆ Nicht-Favorit = Keine Notifications
```

### Verstecken:
```
👁️ Sichtbar = In der Liste
👁️‍🗨️ Versteckt = Nicht in der Liste (aber noch im Ordner)
```

### Drag & Drop (zukünftig):
```
[Streamer A] ----drag----> [Ordner B]
= Verschieben zu anderem Ordner
```

---

## 📞 Feedback / Feature Requests

Was funktioniert nicht? Was wünschst du dir?

- Öffne ein Issue auf GitHub
- Oder schreib auf Discord
- Oder schreib hier eine Nachricht

---

**Happy Streaming! 🎮📺**
