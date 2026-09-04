Schnelle Terminal‑Quickstart für Streamer
=====================================

Ziel: so einfach wie möglich — exakt die Befehle, die man kopieren/einfügen muss.

Option A — Lokal (Windows / Linux)
- Clone das Repo:

```bash
git clone https://github.com/DEIN-USERNAME/streamer-dashboard.git
cd streamer-dashboard
```

- Virtualenv erstellen & aktivieren:

Windows PowerShell:
```powershell
python -m venv venv
venv\Scripts\Activate.ps1
```

Linux / macOS:
```bash
python3 -m venv venv
source venv/bin/activate
```

- Abhängigkeiten installieren (falls `requirements.txt` fehlt, diese Befehle funktionieren trotzdem):

```bash
pip install --upgrade pip
pip install playwright requests python-dotenv supabase
python -m playwright install --with-deps
```

- Beispiel `.env.local` anlegen (kopiere ` .env.example` oder erstelle manuell):

```bash
cp .env.example .env.local
# Öffne .env.local und trage deine Keys ein (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY usw.)
```

- Scraper ausführen (Beispiel: EU, pagesize 50, Top 10000):

```bash
python fortnite_rankings_scraper.py --region EU --pageSize 50 --top 10000
```

Option B — Docker (empfohlen für VPS / Server)
- Auf dem Server: Repository klonen:

```bash
git clone https://github.com/DEIN-USERNAME/streamer-dashboard.git
cd streamer-dashboard
```

- Einmalig: Docker-Image starten, Abhängigkeiten installieren und Scraper ausführen (kopierbar):

Linux (bash):
```bash
docker run --rm -v "$(pwd)":/app -w /app python:3.11-slim bash -c \
"pip install --upgrade pip && pip install playwright requests python-dotenv supabase && python -m playwright install --with-deps && python fortnite_rankings_scraper.py --region EU --pageSize 50 --top 10000"
```

Windows PowerShell:
```powershell
docker run --rm -v ${PWD}:/app -w /app python:3.11-slim bash -c "pip install --upgrade pip && pip install playwright requests python-dotenv supabase && python -m playwright install --with-deps && python fortnite_rankings_scraper.py --region EU --pageSize 50 --top 10000"
```

- Dauerhaft/als Service (empfohlen): erstelle ein kleines Systemd‑Service auf deinem VPS oder nutze Docker Compose. Beispiel systemd (auf dem Server):

1) Kopiere das Repo nach `/opt/streamer-dashboard`.
2) Erstelle `/etc/systemd/system/streamer-scraper.service` mit Inhalt:

```
[Unit]
Description=Streamer Dashboard Scraper

[Service]
WorkingDirectory=/opt/streamer-dashboard
ExecStart=/usr/bin/docker run --rm -v "/opt/streamer-dashboard":/app -w /app python:3.11-slim bash -c "pip install --upgrade pip && pip install playwright requests python-dotenv supabase && python -m playwright install --with-deps && python fortnite_rankings_scraper.py --region EU --pageSize 50 --top 10000"
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Dann aktivieren:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now streamer-scraper.service
```

Wichtige Hinweise
- Wenn du keine Supabase‑Upload brauchst (nur lokale JSON), brauchst du keine Keys.
- Achte darauf, dass `fortnite_rankings_scraper.py` die korrekten CLI‑Argumente akzeptiert (`--region`, `--pageSize`, `--startPage`, `--endPage`, `--top`).
- Passe `--top` oder `--endPage` an, wenn du nur Top‑N brauchst.
- Für einmalige Tests reicht Option A lokal; für regelmäßige (schneller) Runs nutze Option B auf einem VPS.

Probleme / Debugging
- Wenn Playwright Fehler wirft (Browser nicht gefunden), führe lokal aus:
```bash
python -m playwright install --with-deps
```
- Prüfe `rankings_all_regions.json` im Projektordner oder im Supabase‑Bucket (je nach Setup).

Wenn du möchtest, erstelle ich zusätzlich ein fertiges `Dockerfile` + `docker-compose.yml` und eine `systemd` Vorlage, die du nur noch anpassen musst.
