# Diesen Rechner aus dem Betrieb nehmen.
#
# Nicht von Hand starten - dafuer gibt es "hier-stoppen.bat" im Hauptordner.
#
# Gedacht fuer den PC, sobald der Laptop die Seite traegt. Zwei Rechner duerfen
# nicht gleichzeitig ausliefern: CompHub legt seine Daten in Dateien im eigenen
# Ordner ab, und dann landete jede Anfrage zufaellig bei einem von beiden - mit
# unterschiedlichem Stand. Ein Duo, das auf dem einen gesetzt wurde, waere fuer
# die Haelfte der Besucher nicht da.
#
# Geloescht wird nichts. Der Ordner bleibt, die Daten bleiben, die
# Tunnelzugaenge bleiben - nur der Waechter wird abgeschaltet und was laeuft,
# beendet. Zurueckholen laesst sich das mit "dauerbetrieb-einrichten.bat".

$ErrorActionPreference = 'Continue'

function Sag($text, $farbe = 'Gray') { Write-Host "  $text" -ForegroundColor $farbe }

$istAdmin = (New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host ''
Write-Host '  CompHub auf diesem Rechner anhalten' -ForegroundColor White
Write-Host "  Rechner: $env:COMPUTERNAME"
Write-Host ''
Sag 'Danach liefert dieser Rechner die Seite nicht mehr aus.' 'Yellow'
Sag 'Sinnvoll, sobald ein anderer sie traegt.' 'Yellow'
Write-Host ''
$antwort = Read-Host '  Anhalten? (j/n)'
if ($antwort -notmatch '^[jJyY]') { Sag 'Abgebrochen - nichts geaendert.'; exit 0 }

# ------------------------------------------------------------ Der Waechter

foreach ($n in 'CompHub Dauerbetrieb (System)', 'CompHub Dauerbetrieb') {
    $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
    if (-not $t) { continue }
    try {
        Disable-ScheduledTask -TaskName $n -ErrorAction Stop | Out-Null
        Sag "Waechter abgeschaltet: $n" 'Green'
    } catch {
        Sag "Waechter '$n' liess sich nicht abschalten - Adminrechte noetig." 'Yellow'
    }
}

# ------------------------------------------------------ Was gerade laeuft

foreach ($port in 3100, 20999) {
    $treffer = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($v in $treffer) { Stop-Process -Id $v.OwningProcess -Force -ErrorAction SilentlyContinue }
}
# cloudflared kann auch ohne den Messport laufen, etwa aus einem Fenster von Hand.
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

$web = Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue
$tun = Get-NetTCPConnection -LocalPort 20999 -State Listen -ErrorAction SilentlyContinue

Write-Host ''
Sag ('Webserver : ' + $(if ($web) { 'laeuft noch' } else { 'aus' })) $(if ($web) { 'Yellow' } else { 'Green' })
Sag ('Tunnel    : ' + $(if ($tun) { 'laeuft noch' } else { 'aus' })) $(if ($tun) { 'Yellow' } else { 'Green' })

if (($web -or $tun) -and -not $istAdmin) {
    Write-Host ''
    Sag 'Was noch laeuft, gehoert dem Systemkonto. Diese Datei mit Rechtsklick' 'Yellow'
    Sag 'als Administrator starten, dann geht es.' 'Yellow'
}

Write-Host ''
Write-Host '  Dieser Rechner kann jetzt ausgeschaltet werden.' -ForegroundColor Green
Write-Host ''
Sag 'Zurueckholen: dauerbetrieb-einrichten.bat' 'DarkGray'
Write-Host ''
