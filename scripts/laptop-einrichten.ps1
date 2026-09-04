# CompHub auf einem zweiten Rechner in Betrieb nehmen.
#
# Gedacht fuer den Laptop, damit der PC ausgehen kann. Nicht von Hand starten -
# dafuer gibt es "laptop-start.bat" im Hauptordner: Doppelklick, fertig.
#
# Das Skript nimmt einem alles ab, was sonst von Hand zu tippen waere:
#
#   * es sucht eine aeltere Kopie des Werkzeugs auf dem Rechner und holt sich
#     von dort die Zugangsschluessel (.env.local) und die Daten,
#   * es meldet sich bei Cloudflare an und legt diesem Rechner einen eigenen
#     Tunnel an - Dateien vom PC herueberzutragen ist damit nicht noetig,
#   * es holt die Pakete, baut das Werkzeug und traegt den Waechter ein,
#   * und es misst am Ende nach, ob wirklich alles laeuft.
#
# Was es NICHT tut: die Domain umstellen. Solange der PC laeuft, soll er die
# Seite auch ausliefern. Zum Umschalten gibt es "uebernehmen.bat".

$ErrorActionPreference = 'Stop'

$Projekt = Split-Path -Parent $PSScriptRoot
$Name    = 'CompHub Dauerbetrieb (System)'

function Sag($text, $farbe = 'Gray') { Write-Host "  $text" -ForegroundColor $farbe }
function Kopf($text) { Write-Host ''; Write-Host $text -ForegroundColor Cyan }

Write-Host ''
Write-Host '  CompHub einrichten' -ForegroundColor White
Write-Host "  Ordner: $Projekt"

$istAdmin = (New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# ------------------------------------------------------- 1. Voraussetzungen

Kopf '1. Voraussetzungen'

$fehlt = @()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $fehlt += 'Node.js LTS  ->  https://nodejs.org' }
if (-not (Get-Command git  -ErrorAction SilentlyContinue)) { $fehlt += 'Git          ->  https://git-scm.com/download/win' }

$Cloudflared = @(
    'C:\Program Files (x86)\cloudflared\cloudflared.exe',
    'C:\Program Files\cloudflared\cloudflared.exe',
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\cloudflared.exe'),
    (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $Cloudflared) { $fehlt += 'cloudflared  ->  winget install --id Cloudflare.cloudflared' }

if ($fehlt) {
    Sag 'Es fehlt noch etwas:' 'Red'
    foreach ($f in $fehlt) { Sag "    $f" 'Yellow' }
    Sag 'Nach dem Installieren dieses Fenster schliessen und neu starten.' 'Yellow'
    exit 1
}

$knotenVersion = (& node --version) -replace '^v', ''
$knotenGross = [int]($knotenVersion -split '\.')[0]
Sag "Node.js $knotenVersion"
if ($knotenGross -lt 20) {
    Sag "Zu alt. CompHub braucht Node 20 oder hoeher." 'Red'
    Sag 'Altes Node deinstallieren (Einstellungen -> Apps), dann LTS von nodejs.org.' 'Yellow'
    exit 1
}
Sag "cloudflared gefunden"

# ------------------------------------- 2. Schluessel und Daten zusammensuchen

Kopf '2. Zugangsschluessel und Daten'

# Eine aeltere Kopie des Werkzeugs auf diesem Rechner - daher kommen die
# Sachen, die bewusst nicht im GitHub-Verzeichnis liegen. Gesucht wird an den
# Orten, an denen so ein Ordner ueblicherweise landet.
function SucheAltkopie {
    $orte = @(
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
        (Join-Path $env:USERPROFILE 'Desktop'),
        (Join-Path $env:USERPROFILE 'Downloads'),
        (Join-Path $env:USERPROFILE 'OneDrive\Dokumente'),
        (Join-Path $env:USERPROFILE 'Documents'),
        'D:\', 'E:\', 'F:\'
    ) | Where-Object { Test-Path $_ }

    foreach ($ort in $orte) {
        # Zwei Ebenen tief genuegt: der Ordner liegt entweder direkt dort oder
        # in einem Unterordner wie "AUF-DEN-LAPTOP".
        $treffer = Get-ChildItem -Path $ort -Filter '.env.local' -File -Recurse -Depth 2 `
            -Force -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($treffer) {
            $ordner = Split-Path -Parent $treffer.FullName
            if ($ordner -ne $Projekt) { return $ordner }
        }
    }
    return $null
}

$envZiel = Join-Path $Projekt '.env.local'
$datenZiel = Join-Path $Projekt 'data'

# Woran man sieht, dass die Daten noch die aus dem Verzeichnis sind: dort
# liegen nur vier kleine Dateien, die echten Daten sind hunderte.
$datenDuenn = -not (Test-Path (Join-Path $datenZiel 'konten.json'))

if ((-not (Test-Path $envZiel)) -or $datenDuenn) {
    Sag 'Suche eine vorhandene Kopie auf diesem Rechner ...'
    $alt = SucheAltkopie
    if (-not $alt) {
        Sag 'Keine gefunden.' 'Yellow'
    } else {
        Sag "Gefunden: $alt" 'Green'

        if (-not (Test-Path $envZiel)) {
            Copy-Item (Join-Path $alt '.env.local') $envZiel -Force
            Sag 'Zugangsschluessel uebernommen (.env.local)'
        }

        if ($datenDuenn -and (Test-Path (Join-Path $alt 'data'))) {
            Sag 'Daten kopieren (ohne replays, das dauert einen Moment) ...'
            # robocopy statt Copy-Item: es zeigt den Fortschritt, laesst sich
            # abbrechen und fortsetzen und kann Unterordner auslassen.
            & robocopy (Join-Path $alt 'data') $datenZiel /E /XD 'replays' /NFL /NDL /NJH /NJS /NP | Out-Null
            Sag 'Daten uebernommen'
        }
    }
}

if (-not (Test-Path $envZiel)) {
    Sag 'Die Datei .env.local fehlt.' 'Red'
    Sag 'Sie enthaelt die Schluessel fuer Twitch, Google, Discord und Epic und' 'Yellow'
    Sag 'liegt auf dem PC unter C:\Users\jumik\Desktop\streamer-dashboard\.env.local' 'Yellow'
    Sag "Diese eine Datei nach $Projekt kopieren, dann hier weiter." 'Yellow'
    exit 1
}
Sag 'Zugangsschluessel liegen bereit.'
if (Test-Path (Join-Path $datenZiel 'konten.json')) { Sag 'Daten liegen bereit.' }
else { Sag 'Ohne data-Ordner startet das Werkzeug leer - Karten und Konten fehlen dann.' 'Yellow' }

# ------------------------------------------------------------- 3. Der Tunnel

Kopf '3. Der Tunnel'

$CfOrdner = Join-Path $env:USERPROFILE '.cloudflared'
$TunnelName = 'comphub-laptop'

# Die Anmeldung beim Cloudflare-Konto. Sie oeffnet den Browser; dort die Domain
# thecomphub.com anklicken. Danach liegt cert.pem im Ordner und alles Weitere
# geht ohne Nachfrage.
if (-not (Test-Path (Join-Path $CfOrdner 'cert.pem'))) {
    Sag 'Jetzt oeffnet sich der Browser - dort bitte "thecomphub.com" auswaehlen.' 'Yellow'
    Sag 'Danach kommt dieses Fenster von selbst weiter.' 'Yellow'
    & $Cloudflared tunnel login
}
if (-not (Test-Path (Join-Path $CfOrdner 'cert.pem'))) {
    Sag 'Die Anmeldung bei Cloudflare ist nicht durchgekommen.' 'Red'
    Sag 'Nochmal starten, oder von Hand:  cloudflared tunnel login' 'Yellow'
    exit 1
}
Sag 'Bei Cloudflare angemeldet.'

# Ein eigener Tunnel fuer diesen Rechner. Den vom PC mitzunehmen ginge auch,
# haette aber bedeutet, seine Schluesseldatei ueber einen USB-Stick zu tragen -
# und zwei Rechner an einem Tunnel liefern abwechselnd aus, was bei Daten in
# Dateien zu zwei verschiedenen Staenden fuehrt.
$vorhanden = (& $Cloudflared tunnel list) -match [regex]::Escape($TunnelName)
if (-not $vorhanden) {
    Sag "Tunnel '$TunnelName' anlegen ..."
    & $Cloudflared tunnel create $TunnelName | Out-Null
}

$TunnelId = ((& $Cloudflared tunnel list) |
    Select-String -Pattern "^\s*([0-9a-f-]{36})\s+$([regex]::Escape($TunnelName))\s" |
    ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -First 1)

if (-not $TunnelId) {
    Sag "Der Tunnel '$TunnelName' liess sich nicht anlegen oder nicht finden." 'Red'
    exit 1
}
Sag "Tunnel: $TunnelName ($TunnelId)"

# Die Einstellungsdatei wird geschrieben, nicht kopiert: darin stehen absolute
# Pfade, und die eines anderen Rechners zeigen hier ins Leere.
$KonfigDatei = Join-Path $CfOrdner 'config.yml'
@"
tunnel: $TunnelId
credentials-file: $(Join-Path $CfOrdner "$TunnelId.json")
ingress:
  - hostname: thecomphub.com
    service: http://localhost:3100
  - hostname: www.thecomphub.com
    service: http://localhost:3100
  - service: http_status:404
"@ | Set-Content -Path $KonfigDatei -Encoding utf8
Sag "Einstellungen geschrieben: $KonfigDatei"

# ------------------------------------------------------------------ 4. Bauen

Kopf '4. Werkzeug bauen'

Push-Location $Projekt
try {
    if (-not (Test-Path (Join-Path $Projekt 'node_modules'))) {
        Sag 'Pakete holen (mehrere Minuten) ...'
        & npm install --no-audit --no-fund
    }
    if (-not (Test-Path (Join-Path $Projekt '.next\BUILD_ID'))) {
        Sag 'Bauen (mehrere Minuten) ...'
        & npx next build
    }
} finally { Pop-Location }

if (-not (Test-Path (Join-Path $Projekt '.next\BUILD_ID'))) {
    Sag 'Der Bau ist nicht durchgelaufen - bitte die Ausgabe oben weitergeben.' 'Red'
    exit 1
}
Sag 'Fertiger Bau vorhanden.' 'Green'

# ------------------------------------------------------------- 5. Der Waechter

Kopf '5. Waechter eintragen'

$Skript = Join-Path $PSScriptRoot 'dauerbetrieb.ps1'
$aktion = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Skript`""
$imTakt = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 2) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$einst = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

if ($istAdmin) {
    $prinz = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' `
        -LogonType ServiceAccount -RunLevel Highest
    $ausloeser = @((New-ScheduledTaskTrigger -AtStartup), $imTakt)
} else {
    Sag 'Ohne Adminrechte startet der Waechter erst mit deiner Anmeldung.' 'Yellow'
    $prinz = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive -RunLevel Limited
    $ausloeser = @((New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"), $imTakt)
}

Register-ScheduledTask -TaskName $Name -Action $aktion -Trigger $ausloeser `
    -Settings $einst -Principal $prinz -Force `
    -Description 'Startet den CompHub-Webserver (Port 3100) und den Cloudflare-Tunnel neu, falls einer davon fehlt.' | Out-Null

Start-Sleep -Seconds 2
if (-not (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue)) {
    Sag 'Die geplante Aufgabe liess sich nicht eintragen.' 'Red'
    exit 1
}
Sag 'Waechter eingetragen und geprueft.' 'Green'

# ------------------------------------------------------------------ 6. Probe

Kopf '6. Probe'

Start-ScheduledTask -TaskName $Name
Start-Sleep -Seconds 20

$web    = Get-NetTCPConnection -LocalPort 3100  -State Listen -ErrorAction SilentlyContinue
$tunnel = Get-NetTCPConnection -LocalPort 20999 -State Listen -ErrorAction SilentlyContinue

Sag ('Webserver : ' + $(if ($web)    { 'laeuft' } else { 'FEHLT - siehe server-fehler.log' })) $(if ($web) {'Green'} else {'Red'})
Sag ('Tunnel    : ' + $(if ($tunnel) { 'laeuft' } else { 'FEHLT - siehe tunnel.log' }))        $(if ($tunnel) {'Green'} else {'Red'})

Write-Host ''
if ($web -and $tunnel) {
    Write-Host '  Dieser Rechner ist bereit.' -ForegroundColor Green
    Write-Host ''
    Sag 'Die Domain zeigt noch auf den PC. Wenn dieser Rechner sie uebernehmen'
    Sag 'soll, im Hauptordner "uebernehmen.bat" doppelklicken.'
} else {
    Sag 'Noch nicht fertig - siehe die Meldungen oben.' 'Yellow'
}
Write-Host ''
