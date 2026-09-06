# Twitch- und Fortnite-Zugang in die .env.local eintragen - ohne Pfade zu suchen.
#
# Nicht von Hand starten - dafuer gibt es "schluessel-eintragen.bat" im
# Hauptordner.
#
# Anlass: die .env.local steht bewusst nicht im Verzeichnis und kommt deshalb
# nie mit einem Update mit. Neue Schluessel muessen auf jedem Rechner einzeln
# hinein - und im Ordner liegen mehrere Dateien mit aehnlichem Namen
# (.env, .env.example, .env.local). Genau dort ging es schon einmal schief.
#
# Dieses Skript sucht nichts: es liegt im Projektordner und schreibt in die
# .env.local daneben. Jeder Wert wird vorher bei der Gegenstelle geprueft,
# damit ein abgeschnittenes Einfuegen nicht erst auffaellt, wenn eine Suche
# stillschweigend leer bleibt. Genau das war der Fehler beim letzten Mal: die
# Twitch-Kennung war 25 statt 30 Zeichen lang, und Twitch antwortete nur noch
# mit "invalid client".
#
# Leer lassen und Enter druecken ueberspringt einen Wert - dann bleibt der
# bisherige stehen.

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Projekt = Split-Path -Parent $PSScriptRoot
$Datei = Join-Path $Projekt '.env.local'

function Sag($text, $farbe = 'Gray') { Write-Host "  $text" -ForegroundColor $farbe }

Write-Host ''
Write-Host '  Twitch und Fortnite-API eintragen' -ForegroundColor White
Sag "Datei: $Datei"
Write-Host ''

if (-not (Test-Path $Datei)) {
    Sag 'Diese Datei gibt es hier noch nicht.' 'Yellow'
    Sag 'Sie wird angelegt - ohne die uebrigen Eintraege (Mail, Discord,' 'Yellow'
    Sag 'Google) fehlt dem Rechner aber weiterhin einiges.' 'Yellow'
    Write-Host ''
}

$neu = @{}

# ------------------------------------------------------------------- Twitch

Sag 'Twitch: dev.twitch.tv/console/apps -> App -> Client-ID und New Secret'
$twId = (Read-Host '  TWITCH_CLIENT_ID (Enter = ueberspringen)').Trim()
if ($twId) {
    $twGeheim = (Read-Host '  TWITCH_CLIENT_SECRET').Trim()
    if (-not $twGeheim) {
        Sag 'Ohne Secret nuetzt die Kennung nichts - uebersprungen.' 'Yellow'
    } else {
        Sag 'Wird bei Twitch geprueft ...'
        try {
            $antwort = Invoke-RestMethod -Method Post -TimeoutSec 20 `
                -Uri 'https://id.twitch.tv/oauth2/token' `
                -Body @{ client_id = $twId; client_secret = $twGeheim
                         grant_type = 'client_credentials' }
            if ($antwort.access_token) {
                Sag 'Gueltig.' 'Green'
                $neu['TWITCH_CLIENT_ID'] = $twId
                $neu['TWITCH_CLIENT_SECRET'] = $twGeheim
                # Ein alter, fest eingetragener Token wuerde zuerst probiert
                # und scheitert - er muss weg, sonst gilt er weiter.
                $neu['TWITCH_ACCESS_TOKEN'] = $null
            }
        } catch {
            Sag 'Twitch nimmt diese Zugangsdaten nicht an.' 'Red'
            Sag 'Beide Werte sind genau 30 Zeichen lang - haeufig ist beim' 'Yellow'
            Sag 'Einfuegen etwas abgeschnitten worden.' 'Yellow'
        }
    }
    Write-Host ''
}

# ----------------------------------------------------------------- Fortnite

Sag 'Fortnite-API: dash.fortnite-api.com/account'
$fnKey = (Read-Host '  FORTNITE_API_KEY (Enter = ueberspringen)').Trim()
if ($fnKey) {
    Sag 'Wird bei fortnite-api.com geprueft ...'
    try {
        $u = 'https://fortnite-api.com/v2/stats/br/v2/8224fc7512ad42818f381e262e4a6a2b'
        $antwort = Invoke-RestMethod -Uri $u -TimeoutSec 20 `
            -Headers @{ Authorization = $fnKey }
        if ($antwort.status -eq 200) {
            Sag "Gueltig - Antwort fuer $($antwort.data.account.name)." 'Green'
            $neu['FORTNITE_API_KEY'] = $fnKey
        }
    } catch {
        Sag 'fortnite-api.com nimmt diesen Schluessel nicht an.' 'Red'
    }
    Write-Host ''
}

if ($neu.Count -eq 0) {
    Sag 'Nichts eingetragen.' 'Yellow'
    exit 1
}

# ------------------------------------------------------------ Dann schreiben

$zeilen = @()
if (Test-Path $Datei) {
    # Eine vorhandene Zeile wird ersetzt, nicht verdoppelt - sonst gaelte je
    # nach Auslesereihenfolge mal die eine, mal die andere.
    $zeilen = @(Get-Content $Datei | Where-Object {
        $behalten = $true
        foreach ($k in $neu.Keys) { if ($_ -match "^$k=") { $behalten = $false } }
        $behalten
    })
}
foreach ($k in $neu.Keys) {
    if ($null -ne $neu[$k]) { $zeilen += "$k=$($neu[$k])" }
}

# UTF8 ohne BOM: eine Bytefolge am Dateianfang landete sonst im ersten
# Schluessel, und der waere damit still falsch.
[IO.File]::WriteAllLines($Datei, $zeilen, (New-Object Text.UTF8Encoding $false))

Write-Host ''
Sag "Eingetragen: $($neu.Keys -join ', ')" 'Green'
Sag 'Die Datei steht in .gitignore - sie geht nie ins Verzeichnis.' 'DarkGray'
Write-Host ''
Sag 'Damit der laufende Server sie liest, jetzt noch: aktualisieren.bat' 'Yellow'
Write-Host ''
