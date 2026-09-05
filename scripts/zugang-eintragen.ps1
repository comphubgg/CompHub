# Einen Zugang in die .env.local eintragen - ohne Pfade zu suchen.
#
# Nicht von Hand starten - dafuer gibt es "zugang-eintragen.bat" im
# Hauptordner.
#
# Anlass: die .env.local steht bewusst nicht im Verzeichnis, kommt also nie
# mit einem Update mit. Wer einen neuen Schluessel auf dem zweiten Rechner
# braucht, musste ihn bisher von Hand in eine Datei schreiben, die er erst
# einmal finden muss - und im Ordner liegen mehrere Dateien mit aehnlichem
# Namen (.env, .env.example, .env.local). Genau da ging es schief.
#
# Dieses Skript sucht nichts: es liegt im Projektordner und schreibt in die
# .env.local daneben. Der Wert wird vorher bei Discord geprueft, damit ein
# vertippter Schluessel nicht erst dann auffaellt, wenn ein VIP wartet.

$ErrorActionPreference = 'Continue'

$Projekt = Split-Path -Parent $PSScriptRoot
$Datei = Join-Path $Projekt '.env.local'

function Sag($text, $farbe = 'Gray') { Write-Host "  $text" -ForegroundColor $farbe }

Write-Host ''
Write-Host '  Discord-Bot eintragen' -ForegroundColor White
Sag "Datei: $Datei"
Write-Host ''

if (-not (Test-Path $Datei)) {
    Sag 'Diese Datei gibt es hier noch nicht.' 'Yellow'
    Sag 'Das ist in Ordnung - sie wird gleich angelegt. Ohne die uebrigen' 'Yellow'
    Sag 'Eintraege (Mail, Twitch, Google) fehlt dem Rechner aber weiterhin' 'Yellow'
    Sag 'einiges; die ganze Datei gehoert vom PC herueberkopiert.' 'Yellow'
    Write-Host ''
}

$token = Read-Host '  Bot-Token einfuegen (Rechtsklick fuegt ein)'
$token = $token.Trim()

if (-not $token) { Sag 'Nichts eingegeben - abgebrochen.' 'Yellow'; exit 1 }

# ------------------------------------------------------------- Erst pruefen

Sag 'Wird bei Discord geprueft ...'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $antwort = Invoke-RestMethod -Uri 'https://discord.com/api/v10/users/@me' `
        -Headers @{ Authorization = "Bot $token" } -TimeoutSec 20
    Sag "Gueltig: $($antwort.username) (Bot-Id $($antwort.id))" 'Green'
} catch {
    Sag 'Discord nimmt diesen Token nicht an.' 'Red'
    Sag 'Nichts geaendert. Im Developer Portal unter Bot -> Reset Token' 'Yellow'
    Sag 'einen neuen holen und noch einmal versuchen.' 'Yellow'
    exit 1
}

# ------------------------------------------------------------ Dann schreiben

$zeilen = @()
if (Test-Path $Datei) {
    # Eine vorhandene Zeile wird ersetzt, nicht verdoppelt - sonst gaelte je
    # nach Auslesereihenfolge mal die eine, mal die andere.
    $zeilen = @(Get-Content $Datei | Where-Object { $_ -notmatch '^DISCORD_BOT_TOKEN=' })
}
$zeilen += "DISCORD_BOT_TOKEN=$token"

# UTF8 ohne BOM: eine Bytefolge am Dateianfang landete sonst im ersten
# Schluessel, und der waere damit still falsch.
[IO.File]::WriteAllLines($Datei, $zeilen, (New-Object Text.UTF8Encoding $false))

Write-Host ''
Sag 'Eingetragen.' 'Green'
Sag 'Die Datei steht in .gitignore - sie geht nie ins Verzeichnis.' 'DarkGray'
Write-Host ''
Sag 'Damit der laufende Server ihn liest, jetzt noch: aktualisieren.bat' 'Yellow'
Write-Host ''
