# Den oeffentlichen Server auf den neuen Bau umstellen.
#
# Laeuft direkt nach "next build" (siehe das Skript "veroeffentlichen" in der
# package.json). Der alte Server haelt den fertigen Bau von vorhin in der Hand
# und merkt von einem neuen nichts - er muss also einmal beendet werden. Der
# Waechter startet ihn binnen zwei Minuten von selbst wieder; damit die Seite
# aber nicht so lange steht, wird hier gleich selbst gestartet.

$ErrorActionPreference = 'SilentlyContinue'

# Der Projektordner ist die Ebene ueber diesem Skript - fest eingetragene
# Pfade wuerden auf einem zweiten Rechner ins Leere zeigen.
$Projekt = Split-Path -Parent $PSScriptRoot
$Port    = 3100

Write-Host 'Alten Server beenden ...'
$alt = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($v in $alt) { Stop-Process -Id $v.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Write-Host 'Neuen Server starten ...'
Start-Process -FilePath 'node.exe' `
    -ArgumentList 'node_modules\next\dist\bin\next', 'start', '-H', '0.0.0.0', '-p', "$Port" `
    -WorkingDirectory $Projekt -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Projekt 'server.log') `
    -RedirectStandardError  (Join-Path $Projekt 'server-fehler.log')

# Warten, bis er wirklich antwortet - sonst meldet das Skript "fertig",
# waehrend draussen noch der Fehler steht.
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "Der oeffentliche Server laeuft wieder auf Port $Port."
        exit 0
    }
}
Write-Host 'Der Server ist nicht hochgekommen - siehe server-fehler.log.'
exit 1
