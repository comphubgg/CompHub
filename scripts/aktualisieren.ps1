# CompHub auf den neuesten Stand bringen.
#
# Nicht von Hand starten - dafuer gibt es "aktualisieren.bat" im Hauptordner.
#
# Warum das ein eigenes Skript ist und kein blosses "git pull": im
# Projektordner liegen zwei Sorten Dateien nebeneinander. Der Quelltext kommt
# aus dem Verzeichnis und darf jederzeit ueberschrieben werden. Die Daten -
# Turnierkarten, Tierlists, Konten, Profile, dazu .env.local und die
# Tunnelzugaenge - gehoeren dem Rechner und duerfen es nie.
#
# Solange git ein paar Dateien aus dem data-Ordner mitverfolgte, prallten
# beide aufeinander: wer seine Daten kopiert hatte, bekam beim Aktualisieren
# nur noch "Your local changes would be overwritten" - und weil diese Meldung
# im Vorbeirauschen untergeht, sah es so aus, als kaeme schlicht nichts an.
#
# Deshalb hier: erst sichern, dann aktualisieren, dann die Daten wieder an
# ihren Platz. In dieser Reihenfolge kann nichts verlorengehen, auch wenn
# mittendrin etwas schiefgeht.

$ErrorActionPreference = 'Continue'

$Projekt = Split-Path -Parent $PSScriptRoot
$Zeit = Get-Date -Format 'yyyy-MM-dd-HHmm'
$Sicherung = Join-Path $Projekt "sicherung-$Zeit"

function Sag($text, $farbe = 'Gray') { Write-Host "  $text" -ForegroundColor $farbe }
function Kopf($text) { Write-Host ''; Write-Host $text -ForegroundColor Cyan }

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
    Sag 'Dann kommt der Stand nicht ueber git, sondern per Kopie.' 'Yellow'
    exit 1
}

# ------------------------------------------------------------- 1. Sichern

Kopf '1. Daten sichern'

New-Item -ItemType Directory -Force -Path $Sicherung | Out-Null

# Der data-Ordner ohne replays: die sind hunderte Megabyte gross, und Epic
# loescht sie ohnehin nach gut einem Monat.
if (Test-Path (Join-Path $Projekt 'data')) {
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
Sag "Liegt unter: $Sicherung"

# ------------------------------------------------------- 2. Stand einholen

Kopf '2. Neuen Stand holen'

# Oertliche Aenderungen am Quelltext verwerfen. Das ist hier richtig: an
# diesem Rechner wird nicht entwickelt, er liefert nur aus. Die Daten sind
# gesichert und kommen gleich zurueck.
& git -C $Projekt checkout -- . 2>&1 | Out-Null

$vorher = (& git -C $Projekt rev-parse --short HEAD)
$ausgabe = & git -C $Projekt pull --ff-only 2>&1
$ausgabe | ForEach-Object { Sag $_ }
$nachher = (& git -C $Projekt rev-parse --short HEAD)

if ($LASTEXITCODE -ne 0) {
    Sag 'Das Holen ist fehlgeschlagen - siehe die Zeilen darueber.' 'Red'
    Sag "Die Sicherung liegt unter: $Sicherung" 'Yellow'
    exit 1
}

if ($vorher -eq $nachher) { Sag 'Schon aktuell.' }
else { Sag "Neuer Stand: $vorher -> $nachher" 'Green' }

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

# --------------------------------------------------------------- 4. Fertig

Write-Host ''
Write-Host '  Der Stand ist da.' -ForegroundColor Green
Write-Host ''
Sag 'Damit er auch ausgeliefert wird, muss noch gebaut werden:' 'Yellow'
Sag '    npm run veroeffentlichen' 'Yellow'
Sag 'Oder, wenn der alte Server sich nicht abloesen laesst:' 'Yellow'
Sag '    dauerbetrieb-einrichten.bat  (Doppelklick)' 'Yellow'
Write-Host ''
Sag "Die Sicherung bleibt liegen: $Sicherung" 'DarkGray'
Sag 'Sie kann weg, sobald alles laeuft.' 'DarkGray'
Write-Host ''
