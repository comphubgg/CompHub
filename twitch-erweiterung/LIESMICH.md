# CompHub Live – Twitch-Erweiterung

Dateien: `panel.html` (Panel unter dem Stream), `overlay.html` (Video-Overlay), `config.html` (Einstellungen des Streamers), `ext.js`, `ext.css`.
Daten: `app/api/twitch-ext` (prüft das JWT mit `TWITCH_EXT_SECRET`), Logik in `lib/twitchErweiterung.ts`.

## Twitch-Konsole (dev.twitch.tv/console/extensions)
- Typen: Panel + Video – Fullscreen; Konfiguration: „Extension Configuration Page“
- Pfade: Panel `panel.html`, Video-Overlay `overlay.html`, Konfiguration `config.html`
- Panel-Höhe: 500
- „Allowlist for URL Fetching Domains“: `https://www.thecomphub.com`
- „Allowlist for Panel Link Domains“: `https://www.thecomphub.com`

## ZIP für den Upload
    cd twitch-erweiterung && zip -r ../comphub-live.zip panel.html overlay.html config.html ext.js ext.css

## Server
`TWITCH_EXT_SECRET` (Twitch-Konsole → Erweiterung → Einstellungen → Secret, base64) in `web.env` eintragen, danach `docker compose up -d`.
