# Streamer Dashboard Discord Bot

Dieser Bot verwaltet automatisch Dashboard-Access-Keys für Streamer.

## Funktionsumfang

- Generiert neue 7-stellige Access-Keys (Großbuchstaben + Zahlen)
- Deaktiviert alte Keys automatisch
- Sendet neuen Key sicher per Discord-DM
- Prüft Dashboard-User anhand von `data/dashboard.json` und `data/streamers.json`
- Verwendet eine erlaubte Benutzerliste aus `ALLOWED_DISCORD_USERS`

## Einrichtung

1. Kopiere `.env.example` nach `.env`.
2. Setze `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`.
3. Setze `ALLOWED_DISCORD_USERS` auf die erlaubten Discord-Benutzernamen.
4. Starte den Bot mit `npm install` und `npm start`.

## Nutzung

1. Der Bot registriert den Slash-Befehl `/keypanel`.
2. In einem Kanal ` /keypanel` ausführen.
3. Der Bot zeigt den Button `Generate New Key`.
4. Klick auf den Button öffnet ein Modal zur Eingabe des Dashboard-Usernames.
5. Der Bot prüft den Username, erstellt den Key und sendet ihn per DM.

## Datenablage

- `discord-bot/key-store.json`
- `data/dashboard.json`
- `data/streamers.json`
