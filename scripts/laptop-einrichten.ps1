# CompHub auf einem zweiten Rechner in Betrieb nehmen.
#
# Gedacht fuer den Laptop, damit der PC ausgehen kann. Auszufuehren AUF DEM
# LAPTOP, im kopierten Projektordner, als Administrator.
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\laptop-einrichten.ps1
#
# WICHTIG - immer nur ein Rechner gleichzeitig.
#
# Der Tunnel vertraegt zwar mehrere Anschluesse, aber CompHub legt seine Daten
# in Dateien im eigenen Projektordner ab: Turnierkarten, Tierlists, Konten,
# Profile. Liefen PC und Laptop zusammen, landete jede Anfrage zufaellig bei
# einem von beiden - mit unterschiedlichem Stand. Ein Duo, das der Betreiber
# auf dem PC setzt, waere fuer die Haelfte der Besucher nicht da. Deshalb:
# einer laeuft, der andere nicht.

$ErrorActionPreference = 'Stop'

$Projekt = Split-Path -Parent $PSScriptRoot
$Name    = 'CompHub Dauerbetrieb (System)'
$TunnelId = 'a790891f-973a-4a23-a141-d0029e38fdec'

function Sag($text, $farbe = 'Gray') { Write-Host "  $text" -ForegroundColor $farbe }

Write-Host ''
Write-Host "CompHub einrichten in: $Projekt"
Write-Host ''

# --------------------------------------------------------- 1. Voraussetzungen

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p  = New-Object Security.Principal.WindowsPrincipal($id)
$istAdmin = $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Sag 'Node.js fehlt. Holen unter https://nodejs.org (LTS), dann hier weiter.' 'Red'
    exit 1
}
Sag ("Node.js: " + (& node --version))

$Cloudflared = @(
    'C:\Program Files (x86)\cloudflared\cloudflared.exe',
    'C:\Program Files\cloudflared\cloudflared.exe',
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\cloudflared.exe'),
    (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $Cloudflared) {
    Sag 'cloudflared fehlt. In einer Administrator-Eingabeaufforderung:' 'Red'
    Sag '    winget install --id Cloudflare.cloudflared' 'Yellow'
    Sag 'Danach dieses Skript noch einmal starten.' 'Red'
    exit 1
}
Sag "cloudflared: $Cloudflared"

# ------------------------------------------------------- 2. Die Zugangsdaten

# Zwei Dateien machen den Tunnel aus: cert.pem (die Anmeldung beim Konto) und
# <Tunnel-Id>.json (der Schluessel dieses einen Tunnels). Beide liegen auf dem
# PC unter C:\Users\jumik\.cloudflared und muessen mitkommen - neu anmelden
# wuerde einen zweiten Tunnel erzeugen, und die Domain zeigt auf diesen hier.
$Ziel = Join-Path $env:USERPROFILE '.cloudflared'
$Mitgebracht = Join-Path $Projekt 'tunnel-zugang'

$noetig = @('cert.pem', "$TunnelId.json")
$fehlt = $noetig | Where-Object { -not (Test-Path (Join-Path $Ziel $_)) }

if ($fehlt) {
    if (Test-Path $Mitgebracht) {
        New-Item -ItemType Directory -Force -Path $Ziel | Out-Null
        foreach ($d in $noetig) {
            $von = Join-Path $Mitgebracht $d
            if (Test-Path $von) { Copy-Item $von (Join-Path $Ziel $d) -Force }
        }
        $fehlt = $noetig | Where-Object { -not (Test-Path (Join-Path $Ziel $_)) }
    }
}

if ($fehlt) {
    Sag 'Die Tunnel-Zugangsdaten fehlen:' 'Red'
    foreach ($d in $fehlt) { Sag "    $d" 'Red' }
    Write-Host ''
    Sag 'So kommen sie her - auf dem PC diesen Ordner kopieren:' 'Yellow'
    Sag '    C:\Users\jumik\.cloudflared' 'Yellow'
    Sag 'und auf dem Laptop den Inhalt ablegen unter:' 'Yellow'
    Sag "    $Mitgebracht" 'Yellow'
    Sag 'Dann dieses Skript noch einmal starten.' 'Yellow'
    Write-Host ''
    Sag 'Diese zwei Dateien sind der Schluessel zu deiner Domain -' 'Yellow'
    Sag 'nicht ins Internet stellen, nicht in ein oeffentliches Verzeichnis.' 'Yellow'
    exit 1
}
Sag "Zugangsdaten liegen in: $Ziel"

# -------------------------------------------------- 3. Die Einstellungsdatei

# Wird hier geschrieben statt kopiert: in der Datei stehen absolute Pfade, und
# die des PCs zeigen auf diesem Rechner ins Leere.
$KonfigDatei = Join-Path $Ziel 'config.yml'
@"
tunnel: $TunnelId
credentials-file: $(Join-Path $Ziel "$TunnelId.json")
ingress:
  - hostname: thecomphub.com
    service: http://localhost:3100
  - hostname: www.thecomphub.com
    service: http://localhost:3100
  - service: http_status:404
"@ | Set-Content -Path $KonfigDatei -Encoding utf8
Sag "Einstellungen geschrieben: $KonfigDatei"

# ------------------------------------------------------------------ 4. Bauen

if (-not (Test-Path (Join-Path $Projekt 'node_modules'))) {
    Sag 'Pakete holen (das dauert ein paar Minuten) ...'
    Push-Location $Projekt; & npm install; Pop-Location
}
if (-not (Test-Path (Join-Path $Projekt '.next\BUILD_ID'))) {
    Sag 'Werkzeug bauen (das dauert ein paar Minuten) ...'
    Push-Location $Projekt; & npx next build; Pop-Location
}
if (-not (Test-Path (Join-Path $Projekt '.next\BUILD_ID'))) {
    Sag 'Der Bau ist nicht durchgelaufen. Bitte die Ausgabe oben weitergeben.' 'Red'
    exit 1
}
Sag 'Fertiger Bau vorhanden.'

# ------------------------------------------------------------- 5. Der Waechter

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
    $beimStart = New-ScheduledTaskTrigger -AtStartup
    $prinz = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' `
        -LogonType ServiceAccount -RunLevel Highest
    $ausloeser = @($beimStart, $imTakt)
} else {
    Sag 'Ohne Administratorrechte: der Waechter startet erst mit deiner Anmeldung.' 'Yellow'
    $anmeldung = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $prinz = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive -RunLevel Limited
    $ausloeser = @($anmeldung, $imTakt)
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

Sag 'Einmal starten und nachsehen ...'
Start-ScheduledTask -TaskName $Name
Start-Sleep -Seconds 20

$web    = Get-NetTCPConnection -LocalPort 3100  -State Listen -ErrorAction SilentlyContinue
$tunnel = Get-NetTCPConnection -LocalPort 20999 -State Listen -ErrorAction SilentlyContinue

Write-Host ''
Sag ('Webserver : ' + $(if ($web)    { 'laeuft' } else { 'FEHLT - siehe server-fehler.log' })) $(if ($web) {'Green'} else {'Red'})
Sag ('Tunnel    : ' + $(if ($tunnel) { 'laeuft' } else { 'FEHLT - siehe tunnel.log' }))        $(if ($tunnel) {'Green'} else {'Red'})
Write-Host ''
Sag 'Jetzt auf dem PC den Waechter anhalten, sonst liefern beide aus:' 'Yellow'
Sag '    Aufgabenplanung -> "CompHub Dauerbetrieb" -> Deaktivieren' 'Yellow'
Sag '    und cloudflared dort beenden.' 'Yellow'
Write-Host ''
