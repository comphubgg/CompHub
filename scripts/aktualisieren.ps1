# CompHub aktualisieren - holen, bauen, neu starten, nachmessen.
#
# Nicht von Hand starten - dafuer gibt es "aktualisieren.bat" im Hauptordner.
#
# Das hier ist der einzige Knopf, den es fuer ein Update braucht. Vorher waren
# es drei Schritte in drei Fenstern, und wer einen davon vergass, lieferte
# tagelang einen alten Stand aus, ohne es zu merken. Der Betreiber wollte das
# auf eine Datei zusammengezogen haben: "ich mach auf meinem Laptop eine
# Bat-Datei auf, und dann ist es geupdated."
#
# Der Ablauf, und warum in dieser Reihenfolge:
#
#   1. Sichern       - data, .env.local und die Tunnelzugaenge gehoeren dem
#                      Rechner und duerfen nie aus dem Verzeichnis kommen.
#   2. Holen         - oertliche Aenderungen am Quelltext werden verworfen;
#                      hier wird nicht entwickelt, hier wird ausgeliefert.
#   3. Zuruecklegen  - erst danach, damit ein misslungenes Holen nichts kostet.
#   4. Bauen         - nur wenn sich etwas geaendert hat.
#   5. Umstellen     - der alte Server haelt den alten Bau im Speicher und
#                      muss weg. Gehoert er dem Systemkonto, braucht das
#                      Adminrechte - deshalb holt die .bat sie sich.
#   6. Nachmessen    - und zwar draussen, nicht nur hier. "Fertig" ohne Probe
#                      ist die Meldung, die am meisten Zeit gekostet hat.

$ErrorActionPreference = 'Continue'

$Projekt = Split-Path -Parent $PSScriptRoot
$Port = 3100
$MessPort = 20999
$Zeit = Get-Date -Format 'yyyy-MM-dd-HHmm'
$Sicherung = Join-Path $Projekt "sicherung-$Zeit"

function Sag($text, $farbe = 'Gray') { Write-Host "  $text" -ForegroundColor $farbe }
function Kopf($text) { Write-Host ''; Write-Host $text -ForegroundColor Cyan }

$istAdmin = (New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host ''
Write-Host '  CompHub aktualisieren' -ForegroundColor White
Write-Host "  Ordner: $Projekt"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Sag 'Git ist auf diesem Rechner nicht installiert.' 'Red'
    Sag 'winget install --id Git.Git   - danach dieses Fenster neu oeffnen.' 'Yellow'
    exit 1
}
if (-not (Test-Path (Join-Path $Projekt '.git'))) {
    Sag "Das hier ist kein Git-Ordner: $Projekt" 'Red'
    exit 1
}

# ------------------------------------------------------------- 1. Sichern

Kopf '1. Daten sichern'

New-Item -ItemType Directory -Force -Path $Sicherung | Out-Null

if (Test-Path (Join-Path $Projekt 'data')) {
    # Ohne replays: die sind hunderte Megabyte gross, und Epic loescht sie
    # ohnehin nach gut einem Monat.
    & robocopy (Join-Path $Projekt 'data') (Join-Path $Sicherung 'data') /E /XD 'replays' /NFL /NDL /NJH /NJS /NP | Out-Null
    Sag 'data gesichert (ohne replays)'
}
foreach ($d in '.env.local', 'dauerbetrieb-orte.json') {
    $q = Join-Path $Projekt $d
    if (Test-Path $q) { Copy-Item $q (Join-Path $Sicherung $d) -Force; Sag "$d gesichert" }
}
if (Test-Path (Join-Path $Projekt 'tunnel-zugang')) {
    Copy-Item (Join-Path $Projekt 'tunnel-zugang') $Sicherung -Recurse -Force
    Sag 'tunnel-zugang gesichert'
}

# ------------------------------------------------------- 2. Stand einholen

Kopf '2. Neuen Stand holen'

& git -C $Projekt checkout -- . 2>&1 | Out-Null
$vorher = (& git -C $Projekt rev-parse --short HEAD)
$ausgabe = & git -C $Projekt pull --ff-only 2>&1
$holenGing = $LASTEXITCODE -eq 0
$ausgabe | ForEach-Object { Sag $_ }
$nachher = (& git -C $Projekt rev-parse --short HEAD)

if (-not $holenGing) {
    Sag 'Das Holen ist fehlgeschlagen - siehe die Zeilen darueber.' 'Red'
    Sag "Die Sicherung liegt unter: $Sicherung" 'Yellow'
    exit 1
}

$neuerStand = $vorher -ne $nachher
if ($neuerStand) { Sag "Neuer Stand: $vorher -> $nachher" 'Green' }
else { Sag 'Schon aktuell.' }

# ---------------------------------------------------- 3. Daten zurueckholen

Kopf '3. Daten zuruecklegen'

if (Test-Path (Join-Path $Sicherung 'data')) {
    & robocopy (Join-Path $Sicherung 'data') (Join-Path $Projekt 'data') /E /NFL /NDL /NJH /NJS /NP | Out-Null
    Sag 'data zurueckgelegt'
}
foreach ($d in '.env.local', 'dauerbetrieb-orte.json') {
    $q = Join-Path $Sicherung $d
    if (Test-Path $q) { Copy-Item $q (Join-Path $Projekt $d) -Force; Sag "$d zurueckgelegt" }
}
if (Test-Path (Join-Path $Sicherung 'tunnel-zugang')) {
    Copy-Item (Join-Path $Sicherung 'tunnel-zugang') $Projekt -Recurse -Force
    Sag 'tunnel-zugang zurueckgelegt'
}

# --------------------------------------------------------------- 4. Bauen

Kopf '4. Bauen'

Push-Location $Projekt
try {
    if (-not (Test-Path (Join-Path $Projekt 'node_modules'))) {
        Sag 'Pakete fehlen, werden geholt (mehrere Minuten) ...'
        & npm install --no-audit --no-fund
    } elseif ($neuerStand) {
        # Nur wenn sich die Paketliste geaendert hat - npm install dauert
        # Minuten, und meistens hat sich nur Quelltext bewegt.
        $geaendert = & git -C $Projekt diff --name-only "$vorher" "$nachher"
        if ($geaendert -match 'package(-lock)?\.json') {
            Sag 'Die Paketliste hat sich geaendert, Pakete werden geholt ...'
            & npm install --no-audit --no-fund
        }
    }

    if ($neuerStand -or -not (Test-Path (Join-Path $Projekt '.next\BUILD_ID'))) {
        Sag 'Wird gebaut (das dauert ein bis zwei Minuten) ...'
        & npx next build
    } else {
        Sag 'Nichts Neues - der vorhandene Bau bleibt.'
    }
} finally { Pop-Location }

if (-not (Test-Path (Join-Path $Projekt '.next\BUILD_ID'))) {
    Sag 'Der Bau ist nicht durchgelaufen - bitte die Ausgabe oben weitergeben.' 'Red'
    exit 1
}

# ----------------------------------------------------------- 5. Umstellen

Kopf '5. Auf den neuen Stand umstellen'

function WerLauscht($p) {
    return (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
}

$alt = WerLauscht $Port
foreach ($id in $alt) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
for ($i = 0; $i -lt 20 -and (WerLauscht $Port); $i++) { Start-Sleep -Milliseconds 500 }

$nochDa = WerLauscht $Port
if ($nochDa -and $alt -and -not (Compare-Object $nochDa $alt -SyncWindow 0)) {
    Sag 'Der alte Server laesst sich nicht beenden.' 'Red'
    if (-not $istAdmin) {
        Sag 'Er gehoert dem Systemkonto. Bitte diese Datei mit Rechtsklick' 'Yellow'
        Sag 'als Administrator starten - dann geht es.' 'Yellow'
    } else {
        Sag 'Auch als Administrator nicht. Bitte den Rechner neu starten.' 'Yellow'
    }
    exit 1
}
Sag 'Alter Server beendet.'

# Den Waechter machen lassen: er kennt die Orte von cloudflared und der
# Tunneleinstellungen und startet beides, was gerade fehlt.
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'dauerbetrieb.ps1')
Start-Sleep -Seconds 12

# --------------------------------------------------------- 6. Nachmessen

# Fehlt hier etwas, das nur von Hand herueberkommt?
#
# .env.local traegt die Schluessel fuer Twitch, Google, Epic und den
# Mailversand. Sie steht bewusst nicht im Verzeichnis, kommt also auch nicht
# mit einem Update mit. Ohne sie laeuft das Werkzeug, verschickt aber keine
# Mail - und der Nutzer sieht nur "Versand klemmt", ohne zu erfahren, warum.
$envDatei = Join-Path $Projekt '.env.local'
if (-not (Test-Path $envDatei)) {
    Sag '.env.local fehlt - ohne sie verschickt dieser Rechner keine Mail.' 'Yellow'
    Sag 'Vom PC herueberkopieren: C:UsersjumikDesktopstreamer-dashboard.env.local' 'Yellow'
} elseif (-not (Select-String -Path $envDatei -Pattern '^MAIL_PASS=' -Quiet)) {
    Sag '.env.local ist da, aber ohne Mail-Angaben (MAIL_PASS fehlt).' 'Yellow'
    Sag 'Die Datei vom PC ist neuer - noch einmal herueberkopieren.' 'Yellow'
} else {
    Sag '.env.local mit Mailversand vorhanden.'
}

Kopf '6. Nachmessen'

$web = WerLauscht $Port
$tunnel = WerLauscht $MessPort
Sag ('Webserver : ' + $(if ($web) { "laeuft (Vorgang $web)" } else { 'FEHLT - siehe server-fehler.log' })) `
    $(if ($web) { 'Green' } else { 'Red' })
Sag ('Tunnel    : ' + $(if ($tunnel) { 'laeuft' } else { 'FEHLT - siehe tunnel.log' })) `
    $(if ($tunnel) { 'Green' } else { 'Red' })

# Und von aussen, denn nur das zaehlt.
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $antwort = Invoke-WebRequest 'https://thecomphub.com/' -UseBasicParsing -TimeoutSec 30
    Sag ("thecomphub.com : $($antwort.StatusCode) " +
        "($([math]::Round($antwort.RawContentLength / 1024)) KB)") 'Green'
} catch {
    Sag "thecomphub.com : nicht erreichbar - $($_.Exception.Message)" 'Yellow'
    Sag 'Wenn dieser Rechner die Seite tragen soll: uebernehmen.bat' 'Yellow'
}

Write-Host ''
if ($web -and $tunnel) {
    Write-Host '  Fertig. Der neue Stand ist live.' -ForegroundColor Green
} else {
    Write-Host '  Noch nicht fertig - siehe oben.' -ForegroundColor Yellow
}
Write-Host ''
Sag "Die Sicherung bleibt liegen: $Sicherung" 'DarkGray'
Sag 'Sie kann weg, sobald alles laeuft.' 'DarkGray'
Write-Host ''
