# Diesen Rechner die Domain uebernehmen lassen.
#
# Nicht von Hand starten - dafuer gibt es "uebernehmen.bat" im Hauptordner.
#
# thecomphub.com zeigt immer auf genau einen Tunnel, und ein Tunnel laeuft auf
# genau einem Rechner. Dieses Skript stellt den Zeiger auf den Tunnel dieses
# Rechners um. Danach liefert er die Seite aus, der andere nicht mehr.
#
# Warum nicht beide gleichzeitig: CompHub legt seine Daten in Dateien im
# eigenen Ordner ab - Turnierkarten, Tierlists, Konten, Profile. Liefen zwei
# Rechner parallel, landete jede Anfrage zufaellig bei einem von beiden, mit
# unterschiedlichem Stand. Ein Duo, das auf dem einen gesetzt wurde, waere fuer
# die Haelfte der Besucher nicht da.

$ErrorActionPreference = 'Stop'

function Sag($text, $farbe = 'Gray') { Write-Host "  $text" -ForegroundColor $farbe }

$Cloudflared = @(
    'C:\Program Files (x86)\cloudflared\cloudflared.exe',
    'C:\Program Files\cloudflared\cloudflared.exe',
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\cloudflared.exe'),
    (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $Cloudflared) { Sag 'cloudflared ist hier nicht installiert.' 'Red'; exit 1 }

# Welcher Tunnel gehoert diesem Rechner? Der, der in der Einstellungsdatei
# steht - dieselbe, mit der der Waechter ihn startet.
$KonfigDatei = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
if (-not (Test-Path $KonfigDatei)) {
    Sag "Keine Tunneleinstellungen gefunden: $KonfigDatei" 'Red'
    Sag 'Zuerst "laptop-start.bat" ausfuehren.' 'Yellow'
    exit 1
}

$TunnelId = (Get-Content $KonfigDatei | Select-String -Pattern '^tunnel:\s*(\S+)' |
    ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -First 1)
if (-not $TunnelId) { Sag 'In der Einstellungsdatei steht keine Tunnel-Kennung.' 'Red'; exit 1 }

Write-Host ''
Sag "Dieser Rechner: $env:COMPUTERNAME"
Sag "Tunnel:         $TunnelId"
Write-Host ''
Sag 'thecomphub.com und www.thecomphub.com zeigen danach hierher.' 'Yellow'
Sag 'Der andere Rechner liefert dann nicht mehr aus.' 'Yellow'
Write-Host ''
$antwort = Read-Host '  Umstellen? (j/n)'
if ($antwort -notmatch '^[jJyY]') { Sag 'Abgebrochen - nichts geaendert.'; exit 0 }

foreach ($name in 'thecomphub.com', 'www.thecomphub.com') {
    Write-Host ''
    Sag "$name umstellen ..."
    & $Cloudflared tunnel route dns --overwrite-dns $TunnelId $name
}

Write-Host ''
Sag 'Umgestellt. Es dauert bis zu einer Minute, bis es ueberall ankommt.' 'Green'
Write-Host ''
Sag 'Auf dem anderen Rechner nicht vergessen:' 'Yellow'
Sag '  Aufgabenplanung -> "CompHub Dauerbetrieb" -> Deaktivieren' 'Yellow'
Sag '  und cloudflared dort im Taskmanager beenden.' 'Yellow'
Write-Host ''
