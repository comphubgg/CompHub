# Diesen Rechner so einstellen, dass er durchlaeuft.
#
# Gedacht fuer den Laptop, der CompHub ausliefert. Ein Laptop tut ab Werk
# genau das Gegenteil von dem, was ein Server tun soll: nach ein paar Minuten
# schlafen legen, beim Zuklappen erst recht. Waehrend er schlaeft, ist
# thecomphub.com weg - fuer jeden, nicht nur fuer dich.
#
# Geaendert wird ausschliesslich der Netzbetrieb. Im Akkubetrieb bleibt alles,
# wie es ist: laeuft der Laptop ohne Strom, soll er sich weiter schlafen legen,
# statt sich in einer Tasche leerzusaugen und heiss zu werden.

$ErrorActionPreference = 'Continue'

function Sag($text, $farbe = 'Gray') { Write-Host "  $text" -ForegroundColor $farbe }

$istAdmin = (New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $istAdmin) {
    Write-Host ''
    Sag 'Das hier braucht Administratorrechte.' 'Yellow'
    Sag 'Bitte ueber "immer-an.bat" starten - das fragt danach.' 'Yellow'
    Write-Host ''
    exit 1
}

Write-Host ''
Write-Host '  Dauerbetrieb einstellen' -ForegroundColor White
Write-Host ''

# ------------------------------------------------------------ Nicht schlafen

# 0 heisst "nie". Nur am Netz - der Akkuwert bleibt unberuehrt.
& powercfg /change standby-timeout-ac 0
& powercfg /change hibernate-timeout-ac 0
& powercfg /change disk-timeout-ac 0
Sag 'Energiesparmodus und Ruhezustand am Netz: aus'

# Der Bildschirm darf ausgehen - das spart Strom und Waerme und stoert den
# Betrieb nicht. Zehn Minuten.
& powercfg /change monitor-timeout-ac 10
Sag 'Bildschirm am Netz: nach 10 Minuten aus (das ist Absicht)'

# ------------------------------------------------------- Zuklappen: nichts tun

# LIDACTION: 0 = nichts tun, 1 = Energie sparen, 2 = Ruhezustand, 3 = herunterfahren
& powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 2>$null
# Im Akkubetrieb weiterhin schlafen legen.
& powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 1 2>$null
& powercfg /setactive SCHEME_CURRENT
Sag 'Deckel zuklappen am Netz: nichts tun'

# ------------------------------------------- Netzwerkkarte nicht schlafen legen

# Windows darf Netzwerkkarten zum Stromsparen abschalten. Bei einem Rechner,
# der nur wegen des Netzes laeuft, ist das genau falsch: der Tunnel bricht ab,
# und bis er neu verbindet, sehen Besucher einen Fehler.
$karten = Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
    Where-Object { $_.Status -eq 'Up' }
foreach ($k in $karten) {
    try {
        Set-NetAdapterPowerManagement -Name $k.Name -AllowComputerToTurnOffDevice Disabled -ErrorAction Stop
        Sag "Netzwerkkarte '$($k.Name)': darf nicht abgeschaltet werden"
    } catch {
        Sag "Netzwerkkarte '$($k.Name)': liess sich nicht umstellen (nicht schlimm)" 'DarkGray'
    }
}

# ------------------------------------------------------------------- Nachsehen

Write-Host ''
Write-Host '  Kontrolle' -ForegroundColor Cyan

$plan = (& powercfg /getactivescheme)
Sag $plan.Trim()

# Die gesetzten Werte zurueckholen, statt sie nur behauptet zu haben.
$aus = & powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE
$wert = ($aus | Select-String 'Wechselstrom|AC Power Setting Index') -replace '.*:\s*', ''
Sag ("Energiesparmodus am Netz: " + $(if ("$wert".Trim() -match '0x0+$|^0$') { 'nie' } else { "noch gesetzt ($wert)" })) `
    $(if ("$wert".Trim() -match '0x0+$|^0$') { 'Green' } else { 'Yellow' })

$aus2 = & powercfg /query SCHEME_CURRENT SUB_BUTTONS LIDACTION
$wert2 = ($aus2 | Select-String 'Wechselstrom|AC Power Setting Index') -replace '.*:\s*', ''
Sag ("Deckel zuklappen am Netz: " + $(if ("$wert2".Trim() -match '0x0+$|^0$') { 'nichts tun' } else { "noch gesetzt ($wert2)" })) `
    $(if ("$wert2".Trim() -match '0x0+$|^0$') { 'Green' } else { 'Yellow' })

Write-Host ''
Write-Host '  Fertig.' -ForegroundColor Green
Write-Host ''
Sag 'Damit das wirkt, muss der Laptop am Strom haengen.' 'Yellow'
Sag 'Im Akkubetrieb legt er sich weiter schlafen - das ist so gewollt.' 'Yellow'
Write-Host ''
Sag 'Und bitte nicht in eine geschlossene Box: ein Laptop mit zugeklapptem' 'Yellow'
Sag 'Deckel blaest seine Warme seitlich oder nach hinten aus. In einer Kiste' 'Yellow'
Sag 'staut sie sich, er drosselt sich und schaltet im schlimmsten Fall ab.' 'Yellow'
Sag 'Ein offenes Regalbrett reicht voellig.' 'Yellow'
Write-Host ''
