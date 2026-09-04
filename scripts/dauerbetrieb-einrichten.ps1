# CompHub wirklich rund um die Uhr - einmalig als Administrator ausfuehren.
#
# Ohne diesen Schritt laeuft der Waechter nur, solange jumik angemeldet ist:
# eine geplante Aufgabe im Benutzerkontext startet erst mit der Anmeldung. Nach
# einem Neustart, bei dem niemand den Anmeldebildschirm wegklickt, waere die
# Seite also weg - und draussen stuende wieder "Bad gateway".
#
# Hier wird dieselbe Aufgabe deshalb unter dem Systemkonto eingerichtet: sie
# laeuft ab dem Hochfahren, ohne Anmeldung, und sieht alle zwei Minuten nach,
# ob Webserver und Tunnel stehen.
#
# So starten:
#   Rechtsklick auf "Windows PowerShell" -> "Als Administrator ausfuehren"
#   powershell -ExecutionPolicy Bypass -File "C:\Users\jumik\Desktop\streamer-dashboard\scripts\dauerbetrieb-einrichten.ps1"

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p  = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host ''
    Write-Host '  Das hier braucht Administratorrechte.' -ForegroundColor Yellow
    Write-Host '  PowerShell mit Rechtsklick als Administrator neu oeffnen.'
    Write-Host ''
    exit 1
}

$Skript = Join-Path $PSScriptRoot 'dauerbetrieb.ps1'
if (-not (Test-Path $Skript)) {
    Write-Host "  Nicht gefunden: $Skript" -ForegroundColor Red
    exit 1
}

$Name = 'CompHub Dauerbetrieb (System)'

# ------------------------------------------------------------- Die Aufgabe

Write-Host 'Aufgabe eintragen ...'

$aktion = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Skript`""

# Zwei Ausloeser: einmal beim Hochfahren, danach alle zwei Minuten. Der zweite
# faengt alles ab, was zwischendurch abstuerzt.
$beimStart = New-ScheduledTaskTrigger -AtStartup
$imTakt    = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 2) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$einst = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

# "NT AUTHORITY\SYSTEM" ausgeschrieben: die Kurzform "SYSTEM" wird zwar
# angenommen, aber nicht auf jedem Rechner zum Systemkonto aufgeloest - dann
# entsteht die Aufgabe scheinbar und ist hinterher nicht da.
$prinz = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' `
    -LogonType ServiceAccount -RunLevel Highest

$angelegt = $false
try {
    Register-ScheduledTask -TaskName $Name -Action $aktion `
        -Trigger $beimStart, $imTakt -Settings $einst -Principal $prinz -Force `
        -Description 'Startet den CompHub-Webserver (Port 3100) und den Cloudflare-Tunnel neu, falls einer davon fehlt. Laeuft ab dem Hochfahren, ohne Anmeldung.' | Out-Null
    $angelegt = $true
} catch {
    Write-Host ("  Das Systemkonto ging nicht: " + $_.Exception.Message) -ForegroundColor Yellow
}

# Nachsehen statt hoffen. Genau hier ist es beim ersten Versuch stillschweigend
# schiefgegangen: das Skript meldete Vollzug, und die Aufgabe war nicht da.
Start-Sleep -Seconds 2
if (-not (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue)) {
    $angelegt = $false
}

if (-not $angelegt) {
    Write-Host '  Die Aufgabe unter dem Systemkonto liess sich nicht eintragen.' -ForegroundColor Red
    Write-Host '  Die Aufgabe im Benutzerkonto bleibt bestehen - CompHub laeuft also,'
    Write-Host '  solange du angemeldet bist. Bitte diese Meldung weitergeben.'
    exit 1
}

Write-Host '  eingetragen und geprueft.' -ForegroundColor Green

# Die Aufgabe im Benutzerkonto wird jetzt nicht mehr gebraucht - zwei Waechter
# nebeneinander wuerden sich beim Starten in die Quere kommen.
Unregister-ScheduledTask -TaskName 'CompHub Dauerbetrieb' -Confirm:$false -ErrorAction SilentlyContinue

# ---------------------------------------------------- Der leere Dienst

# Der mitgelieferte Windows-Dienst "Cloudflared" wurde ohne Einstellungsdatei
# eingerichtet und liefert deshalb nichts aus. Er belegt nur den Namen und
# sieht im Taskmanager aus, als liefe der Tunnel.
#
# Angehalten wird er ueber sc.exe, nicht ueber Stop-Service: Stop-Service
# wartet, bis der Dienst von sich aus aufhoert, und dieser hoert nicht auf -
# das Skript blieb dort mit "Warten auf Beendigung des Diensts" haengen.
Write-Host 'Den leeren Cloudflared-Dienst abschalten ...'
if (Get-Service -Name 'Cloudflared' -ErrorAction SilentlyContinue) {
    & sc.exe config Cloudflared start= disabled | Out-Null
    & sc.exe stop   Cloudflared | Out-Null
    Start-Sleep -Seconds 3
    # Bleibt er haengen, hilft nur der harte Weg. Unser eigener Tunnel laeuft
    # als gewoehnlicher Vorgang weiter und wird davon nicht getroffen: er
    # gehoert nicht zum Dienst.
    $dienstPid = (Get-CimInstance Win32_Service -Filter "Name='Cloudflared'").ProcessId
    if ($dienstPid -and $dienstPid -ne 0) {
        Stop-Process -Id $dienstPid -Force -ErrorAction SilentlyContinue
    }
    Write-Host '  abgeschaltet.'
}

# ------------------------------------------------------------- Die Probe

Write-Host 'Einmal ausfuehren, damit sofort alles steht ...'
Start-ScheduledTask -TaskName $Name
Start-Sleep -Seconds 15

$web    = Get-NetTCPConnection -LocalPort 3100  -State Listen -ErrorAction SilentlyContinue
$tunnel = Get-NetTCPConnection -LocalPort 20999 -State Listen -ErrorAction SilentlyContinue

Write-Host ''
Write-Host ('  Webserver : ' + $(if ($web)    { 'laeuft' } else { 'FEHLT - siehe server-fehler.log' }))
Write-Host ('  Tunnel    : ' + $(if ($tunnel) { 'laeuft' } else { 'FEHLT - siehe tunnel.log' }))
Write-Host ''
Write-Host '  Fertig. CompHub startet jetzt mit dem Rechner, ohne Anmeldung.'
Write-Host ''
