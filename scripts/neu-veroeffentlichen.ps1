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

$alteKennung = WerLauscht

Write-Host 'Alten Server beenden ...'
foreach ($id in $alteKennung) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }

# Bis zu zehn Sekunden warten, statt blind weiterzumachen.
for ($i = 0; $i -lt 20 -and (WerLauscht); $i++) { Start-Sleep -Milliseconds 500 }

$nochDa = WerLauscht
if ($nochDa -and $alteKennung -and (Compare-Object $nochDa $alteKennung -SyncWindow 0) -eq $null) {
    Write-Host ''
    Write-Host '  Der alte Server laesst sich nicht beenden.' -ForegroundColor Red
    Write-Host '  Er gehoert dem Systemkonto - ein gewoehnliches Fenster darf das nicht.'
    Write-Host ''
    Write-Host '  Der neue Bau liegt bereit, ausgeliefert wird aber weiter der alte.'
    Write-Host '  Zum Umstellen im Hauptordner doppelklicken:' -ForegroundColor Yellow
    Write-Host '      dauerbetrieb-einrichten.bat' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

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
