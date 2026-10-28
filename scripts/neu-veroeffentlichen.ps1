# Den oeffentlichen Server auf den neuen Bau umstellen.
#
# Laeuft direkt nach "next build" (siehe das Skript "veroeffentlichen" in der
# package.json). Der alte Server haelt den fertigen Bau von vorhin in der Hand
# und merkt von einem neuen nichts - er muss also einmal beendet werden.
#
# Warum das hier so ausfuehrlich prueft: startet der Waechter den Server unter
# dem Systemkonto, gehoert der Vorgang danach dem System, und ein gewoehnliches
# Fenster darf ihn nicht mehr beenden. Das Skript hat das frueher nicht gemerkt
# - es sah nur "auf Port 3100 lauscht jemand" und meldete Vollzug. Draussen
# lief derweil weiter der Stand von vorgestern, und die Fehlersuche ging in die
# falsche Richtung. Jetzt wird die Kennung des Vorgangs verglichen: dieselbe
# Kennung heisst, es hat nicht geklappt, und das steht dann auch da.

$ErrorActionPreference = 'SilentlyContinue'

# Der Projektordner ist die Ebene ueber diesem Skript - fest eingetragene
# Pfade wuerden auf einem zweiten Rechner ins Leere zeigen.
$Projekt = Split-Path -Parent $PSScriptRoot
$Port    = 3100

function WerLauscht {
    return (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
}

# Die Verknuepfungen, die der Bau fuer Pakete mit Programmteil anlegt (.next\node_modules\sharp-<Pruefsumme>), durch echte Ordner ersetzen.
#
# Turbopack bindet sharp ueber einen Alias mit Pruefsumme ein und legt dazu eine Verknuepfung (Junction) an. Der oeffentliche Server laeuft unter dem Systemkonto
# (Waechter), und dort fand Node den Alias durch die Verknuepfung nicht: jede Schnittstelle, die sharp braucht, gab 500 "Internal Server Error" - die Posts des Tages,
# die Beitragsbilder, die Org-Logos (Betreiber, 19.10.2026). Ein echter Ordner mit einer Zeile, die auf das Paket zeigt, wird dagegen ueberall gefunden.
# Seit 28.10.2026 liegt der neue Bau zuerst in .next-bau (scripts/bauen-daneben.mjs) - dort ersetzen, bevor umgeschaltet wird.
$BauOrdner = if (Test-Path (Join-Path $Projekt '.next-bau\BUILD_ID')) { '.next-bau' } else { '.next' }
$Alias = Join-Path $Projekt "$BauOrdner\node_modules"
if (Test-Path $Alias) {
    foreach ($e in (Get-ChildItem -Path $Alias -Force)) {
        if (-not ($e.Attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }
        $ziel = @($e.Target)[0]
        if (-not $ziel) { continue }
        $name = $e.Name
        $e.Delete()
        $ordner = Join-Path $Alias $name
        New-Item -ItemType Directory -Path $ordner -Force | Out-Null
        $zielJs = ($ziel -replace '\\', '/')
        Set-Content -Path (Join-Path $ordner 'index.js') -Value "module.exports = require('$zielJs');" -Encoding ascii
        Set-Content -Path (Join-Path $ordner 'package.json') -Value "{`"name`":`"$name`",`"main`":`"index.js`"}" -Encoding ascii
        Write-Host "Verknuepfung $name durch einen echten Ordner ersetzt."
    }
}

$alteKennung = WerLauscht

Write-Host 'Alten Server beenden ...'
foreach ($id in $alteKennung) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }

# Bis zu zehn Sekunden warten, statt blind weiterzumachen.
for ($i = 0; $i -lt 20 -and (WerLauscht); $i++) { Start-Sleep -Milliseconds 500 }

$nochDa = WerLauscht
if ($nochDa -and $alteKennung -and (Compare-Object $nochDa $alteKennung -SyncWindow 0) -eq $null) {
    # Der alte Server gehoert dem Systemkonto. Ein gewoehnliches Fenster darf ihn nicht beenden - aber der
    # Waechter (scripts/dauerbetrieb.ps1, laeuft alle zwei Minuten) darf es und tut es auf Zuruf: er sucht im
    # Projektordner nach neustart.txt, beendet den Server und startet ihn mit dem neuen Bau.
    Write-Host 'Der alte Server gehoert dem Systemkonto - der Waechter startet ihn gleich neu (hoechstens drei Minuten) ...'
    Set-Content -Path (Join-Path $Projekt 'neustart.txt') -Value (Get-Date -Format 'o') -Encoding ascii
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Seconds 2
        $jetzt = WerLauscht
        if ($jetzt -and (Compare-Object $jetzt $alteKennung -SyncWindow 0)) {
            Write-Host "Der oeffentliche Server laeuft mit dem neuen Bau (Vorgang $jetzt)."
            exit 0
        }
    }
    Remove-Item -Path (Join-Path $Projekt 'neustart.txt') -Force -ErrorAction SilentlyContinue
    Write-Host ''
    Write-Host '  Der Waechter hat den Server nicht neu gestartet.' -ForegroundColor Red
    Write-Host '  Der neue Bau liegt bereit, ausgeliefert wird aber weiter der alte.'
    Write-Host '  Zum Umstellen im Hauptordner doppelklicken:' -ForegroundColor Yellow
    Write-Host '      dauerbetrieb-einrichten.bat' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

# Der alte Server steht: jetzt den neuen Bau an seine Stelle setzen (scripts/bau-umschalten.ps1).
. (Join-Path $PSScriptRoot 'bau-umschalten.ps1')
Write-Host (BauUmschalten $Projekt)

Write-Host 'Neuen Server starten ...'
Start-Process -FilePath 'node.exe' `
    -ArgumentList 'node_modules\next\dist\bin\next', 'start', '-H', '0.0.0.0', '-p', "$Port" `
    -WorkingDirectory $Projekt -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Projekt 'server.log') `
    -RedirectStandardError  (Join-Path $Projekt 'server-fehler.log')

# Warten, bis er wirklich antwortet - sonst meldet das Skript "fertig",
# waehrend draussen noch der Fehler steht.
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    $jetzt = WerLauscht
    if ($jetzt) {
        Write-Host "Der oeffentliche Server laeuft wieder auf Port $Port (Vorgang $jetzt)."
        exit 0
    }
}

Write-Host 'Der Server ist nicht hochgekommen - siehe server-fehler.log.' -ForegroundColor Red
exit 1
