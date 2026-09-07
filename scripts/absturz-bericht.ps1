# Sammelt, warum dieser Rechner abgestuerzt ist.
#
# Gedacht fuer den Laptop, der CompHub ausliefert. Er stuerzt in letzter Zeit
# ab ("Your device ran into a problem"), startet neu, und danach ist die Seite
# offline. Beides hat wahrscheinlich verschiedene Ursachen, und beide stehen
# im Ereignisprotokoll - man muss nur an der richtigen Stelle nachsehen.
#
# Dieses Skript aendert nichts. Es liest nur und schreibt einen Bericht auf
# den Desktop. Genau in dieser Reihenfolge, weil sich daraus die Ursache
# ablesen laesst:
#
#   1. Was Windows selbst zum Absturz sagt (Bluescreen-Code, Datum)
#   2. Ob es Hardware war - Speicher, Prozessor, Bus (WHEA)
#   3. Ob es die Platte war (Lese-/Schreibfehler, SMART)
#   4. Ob es die Temperatur war
#   5. Ob Treiber oder Updates kurz davor kamen
#   6. Ob die CompHub-Aufgabe nach dem Neustart wieder angelaufen ist
#
# Der Bericht enthaelt keine Passwoerter und keine Schluessel - nur
# Ereignisnamen, Zeitpunkte und Geraetebezeichnungen.

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

$Ziel = Join-Path ([Environment]::GetFolderPath('Desktop')) 'CompHub-Absturzbericht.txt'
$Zeilen = New-Object System.Collections.Generic.List[string]

function Zeile($t = '') { $Zeilen.Add([string]$t) }
function Titel($t) {
    Zeile ''
    Zeile ('=' * 74)
    Zeile "  $t"
    Zeile ('=' * 74)
}
function Sag($t, $farbe = 'Gray') { Write-Host "  $t" -ForegroundColor $farbe }

Write-Host ''
Write-Host '  CompHub - Absturzbericht' -ForegroundColor White
Write-Host '  Es wird nur gelesen, nichts geaendert.' -ForegroundColor DarkGray
Write-Host ''

# --------------------------------------------------------------- Der Rechner

Titel 'Der Rechner'
$os  = Get-CimInstance Win32_OperatingSystem
$cs  = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
Zeile "Name            : $($cs.Name)"
Zeile "Modell          : $($cs.Manufacturer) $($cs.Model)"
Zeile "Windows         : $($os.Caption) $($os.Version) (Build $($os.BuildNumber))"
Zeile "BIOS            : $($bios.SMBIOSBIOSVersion) vom $($bios.ReleaseDate)"
Zeile "Arbeitsspeicher : $([math]::Round($cs.TotalPhysicalMemory / 1GB, 1)) GB"
Zeile "Laeuft seit     : $($os.LastBootUpTime)"
Zeile "Jetzt           : $(Get-Date)"
Sag 'Rechner erfasst'

# ------------------------------------------------------- 1. Die Abstuerze

Titel '1. Abstuerze und unerwartete Neustarts (letzte 30 Tage)'
Zeile 'Ereignis 1001 = Bluescreen mit Fehlercode.'
Zeile 'Ereignis 41   = der Rechner ging aus, ohne sich ordentlich zu beenden.'
Zeile 'Ereignis 6008 = beim Hochfahren gemerkt, dass der letzte Halt unsauber war.'
Zeile ''

$seit = (Get-Date).AddDays(-30)
$absturz = Get-WinEvent -FilterHashtable @{
    LogName = 'System'; Id = 1001, 41, 6008; StartTime = $seit
} -MaxEvents 120

if ($absturz) {
    foreach ($e in $absturz | Sort-Object TimeCreated -Descending) {
        $text = ($e.Message -replace '\s+', ' ').Trim()
        if ($text.Length -gt 400) { $text = $text.Substring(0, 400) + ' …' }
        Zeile ("[{0:yyyy-MM-dd HH:mm:ss}] ({1}) {2}" -f $e.TimeCreated, $e.Id, $e.ProviderName)
        Zeile "    $text"
        Zeile ''
    }
    Sag ("$($absturz.Count) Absturzereignisse gefunden") 'Yellow'
} else {
    Zeile 'Nichts gefunden - in den letzten 30 Tagen kein Bluescreen im Protokoll.'
    Sag 'Keine Absturzereignisse'
}

# --------------------------------------------------------- Die Speicherabbilder

Titel '2. Speicherabbilder (Minidumps)'
Zeile 'Jeder Bluescreen legt hier eine Datei ab. Ihr Datum sagt, wann es war;'
Zeile 'ihr Inhalt sagt, welcher Treiber es ausgeloest hat - den kann ein'
Zeile 'Auswerteprogramm lesen, dieses Skript nennt nur Datei und Zeit.'
Zeile ''
$dumps = Get-ChildItem 'C:\Windows\Minidump\*.dmp' | Sort-Object LastWriteTime -Descending
if ($dumps) {
    foreach ($d in $dumps | Select-Object -First 20) {
        Zeile ("{0:yyyy-MM-dd HH:mm:ss}   {1,8:N0} kB   {2}" -f
            $d.LastWriteTime, ($d.Length / 1KB), $d.Name)
    }
    Zeile ''
    Zeile "Insgesamt: $($dumps.Count) Dateien."
    Sag ("$($dumps.Count) Speicherabbilder") 'Yellow'
} else {
    Zeile 'Keine gefunden. Entweder gab es keinen Bluescreen, oder das Anlegen'
    Zeile 'von Speicherabbildern ist ausgeschaltet.'
    Sag 'Keine Speicherabbilder'
}

# ------------------------------------------------------------- 3. Hardware

Titel '3. Hardwarefehler (WHEA)'
Zeile 'WHEA meldet Fehler, die die Hardware selbst erkennt: Speicher, Prozessor,'
Zeile 'PCI-Bus. Steht hier etwas, ist es fast nie Windows und fast immer ein Teil.'
Zeile ''
$whea = Get-WinEvent -FilterHashtable @{
    LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger'; StartTime = $seit
} -MaxEvents 60
if ($whea) {
    foreach ($e in $whea | Sort-Object TimeCreated -Descending | Select-Object -First 25) {
        $text = ($e.Message -replace '\s+', ' ').Trim()
        if ($text.Length -gt 300) { $text = $text.Substring(0, 300) + ' …' }
        Zeile ("[{0:yyyy-MM-dd HH:mm:ss}] Id {1}: {2}" -f $e.TimeCreated, $e.Id, $text)
    }
    Sag ("$($whea.Count) Hardwaremeldungen") 'Red'
} else {
    Zeile 'Keine. Das spricht gegen einen Defekt an Speicher oder Prozessor.'
    Sag 'Keine Hardwaremeldungen'
}

# ---------------------------------------------------------------- 4. Platte

Titel '4. Festplatte'
# Nach Ereignisnummer allein zu suchen genuegt nicht: die 153 vergibt auch
# Kernel-Boot, und zwar fuer eine voellig harmlose Meldung ueber die
# virtualisierungsbasierte Sicherheit. Beim Ausprobieren standen dadurch
# sechzig "Plattenfehler" im Bericht, von denen keiner einer war. Deshalb
# zaehlt nur, was wirklich von der Platte oder ihrem Treiber kommt.
$plattenQuellen = @('disk', 'Disk', 'Ntfs', 'volmgr', 'storahci', 'stornvme',
                    'iaStorA', 'nvraid', 'msahci')
$plattenFehler = Get-WinEvent -FilterHashtable @{
    LogName = 'System'; Id = 7, 11, 51, 153; StartTime = $seit
} -MaxEvents 200 | Where-Object { $plattenQuellen -contains $_.ProviderName }
if ($plattenFehler) {
    Zeile 'Lese- oder Schreibfehler im Protokoll:'
    foreach ($e in $plattenFehler | Sort-Object TimeCreated -Descending | Select-Object -First 20) {
        $text = ($e.Message -replace '\s+', ' ').Trim()
        if ($text.Length -gt 220) { $text = $text.Substring(0, 220) + ' …' }
        Zeile ("[{0:yyyy-MM-dd HH:mm:ss}] Id {1} ({2}): {3}" -f
            $e.TimeCreated, $e.Id, $e.ProviderName, $text)
    }
    Sag ("$($plattenFehler.Count) Plattenfehler") 'Red'
} else {
    Zeile 'Keine Lese- oder Schreibfehler im Protokoll.'
    Sag 'Keine Plattenfehler'
}

Zeile ''
Zeile 'Zustand der Laufwerke, wie sie ihn selbst melden:'
foreach ($p in Get-PhysicalDisk) {
    Zeile ("  {0,-34} {1,-7} Zustand: {2,-9} Abnutzung: {3}" -f
        $p.FriendlyName, $p.MediaType, $p.HealthStatus,
        $(if ($null -ne $p.Wear) { "$($p.Wear)%" } else { '—' }))
}
foreach ($v in Get-Volume | Where-Object { $_.DriveLetter }) {
    if ($v.Size -gt 0) {
        Zeile ("  Laufwerk {0}: {1,6:N1} GB frei von {2,6:N1} GB   Zustand: {3}" -f
            $v.DriveLetter, ($v.SizeRemaining / 1GB), ($v.Size / 1GB), $v.HealthStatus)
    }
}

# ------------------------------------------------------------ 5. Temperatur

Titel '5. Temperatur'
Zeile 'Ein Laptop, der Tag und Nacht laeuft, staubt zu und wird heiss. Wird es zu'
Zeile 'heiss, schaltet er sich zum Schutz ab - das sieht aus wie ein Absturz.'
Zeile ''
$temp = Get-CimInstance -Namespace 'root/WMI' -ClassName MSAcpi_ThermalZoneTemperature
if ($temp) {
    foreach ($z in $temp) {
        $c = [math]::Round(($z.CurrentTemperature / 10) - 273.15, 1)
        Zeile ("  {0}: {1} °C" -f $z.InstanceName, $c)
    }
} else {
    Zeile '  Der Rechner gibt ueber diesen Weg keine Temperatur heraus - bei vielen'
    Zeile '  Laptops ist das normal. Ein Blick ins BIOS oder ein Programm wie HWiNFO'
    Zeile '  zeigt sie trotzdem.'
}
$thermal = Get-WinEvent -FilterHashtable @{
    LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Processor-Power'; StartTime = $seit
} -MaxEvents 20
if ($thermal) {
    Zeile ''
    Zeile 'Meldungen zur Prozessorleistung (oft Drosselung wegen Hitze):'
    foreach ($e in $thermal | Select-Object -First 8) {
        Zeile ("[{0:yyyy-MM-dd HH:mm}] Id {1}" -f $e.TimeCreated, $e.Id)
    }
}
Sag 'Temperatur abgefragt'

# --------------------------------------------------- 6. Treiber und Updates

Titel '6. Was kurz vor den Abstuerzen installiert wurde'
Zeile 'Kommt ein neuer Treiber und stuerzt es danach ab, ist die Ursache meist da.'
Zeile ''
Zeile 'Zuletzt installierte Updates:'
foreach ($u in Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 12) {
    Zeile ("  {0:yyyy-MM-dd}  {1,-12} {2}" -f $u.InstalledOn, $u.HotFixID, $u.Description)
}
Zeile ''
Zeile 'Zuletzt geaenderte Treiberdateien:'
$treiber = Get-ChildItem 'C:\Windows\System32\drivers\*.sys' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 12
foreach ($t in $treiber) {
    Zeile ("  {0:yyyy-MM-dd HH:mm}  {1}" -f $t.LastWriteTime, $t.Name)
}
Zeile ''
Zeile 'Stehen Windows-Updates auf automatisch?'
$wu = Get-Service wuauserv
Zeile ("  Dienst wuauserv: {0}, Starttyp {1}" -f $wu.Status, $wu.StartType)
Sag 'Treiber und Updates erfasst'

# ---------------------------------------------------- 7. Kommt CompHub hoch?

Titel '7. Faehrt CompHub nach einem Neustart von selbst wieder hoch?'
Zeile 'Dafuer gibt es die geplante Aufgabe "CompHub Dauerbetrieb". Sie laeuft als'
Zeile 'SYSTEM, beim Hochfahren und danach alle zwei Minuten, und startet Server'
Zeile 'und Tunnel, wenn sie fehlen. Fehlt die Aufgabe oder schlaegt sie fehl,'
Zeile 'bleibt die Seite nach einem Absturz offline - genau das Bild, das er'
Zeile 'beschreibt.'
Zeile ''
$auf = Get-ScheduledTask -TaskName 'CompHub Dauerbetrieb'
if ($auf) {
    $info = Get-ScheduledTaskInfo -TaskName 'CompHub Dauerbetrieb'
    Zeile "  Aufgabe vorhanden : ja"
    Zeile "  Zustand           : $($auf.State)"
    Zeile "  Zuletzt gelaufen  : $($info.LastRunTime)"
    Zeile "  Ergebnis          : $($info.LastTaskResult)  (0 heisst in Ordnung)"
    Zeile "  Naechster Lauf    : $($info.NextRunTime)"
    if ($info.LastTaskResult -ne 0) { Sag 'Aufgabe meldet einen Fehler' 'Red' }
    else { Sag 'Aufgabe vorhanden und in Ordnung' 'Green' }
} else {
    Zeile '  Aufgabe vorhanden : NEIN'
    Zeile ''
    Zeile '  Das ist wahrscheinlich der Grund, warum die Seite nach jedem Neustart'
    Zeile '  offline bleibt. Abhilfe: "dauerbetrieb-einrichten.bat" im Projektordner'
    Zeile '  einmal als Administrator ausfuehren.'
    Sag 'Aufgabe fehlt - Seite kommt nach Neustart nicht von selbst hoch' 'Red'
}

Zeile ''
Zeile 'Startet Windows nach einem Bluescreen von selbst neu?'
$cw = Get-CimInstance Win32_OSRecoveryConfiguration
Zeile "  Automatischer Neustart: $($cw.AutoReboot)"
Zeile "  Speicherabbild        : $($cw.DebugInfoType)  (3 = kleines Abbild)"

Zeile ''
Zeile 'Das Protokoll des Dauerbetriebs (letzte 40 Zeilen), falls vorhanden:'
$log = Join-Path (Split-Path -Parent $PSScriptRoot) 'dauerbetrieb.log'
if (Test-Path $log) {
    foreach ($z in (Get-Content $log -Tail 40)) { Zeile "  $z" }
} else {
    Zeile "  Keins gefunden unter $log"
}

# ------------------------------------------------------------------ Schluss

Titel 'Fertig'
Zeile 'Diese Datei an Claude schicken - daraus laesst sich sagen, ob es Hardware,'
Zeile 'ein Treiber, die Platte oder die Temperatur war.'

# Die Kurzfassung kommt ganz nach oben, nicht ans Ende: wer die Datei
# oeffnet, soll in fuenf Zeilen wissen, woran er ist, ohne durch achthundert
# Zeilen Protokoll zu scrollen.
$kurz = New-Object System.Collections.Generic.List[string]
$kurz.Add('CompHub - Absturzbericht')
$kurz.Add("Erstellt: $(Get-Date -Format 'yyyy-MM-dd HH:mm')  auf $($cs.Name)")
$kurz.Add('')
$kurz.Add('KURZFASSUNG')
$kurz.Add(('-' * 74))
$kurz.Add("  Abstuerze in 30 Tagen  : $(if ($absturz) { $absturz.Count } else { 0 })")
$kurz.Add("  Speicherabbilder       : $(if ($dumps) { $dumps.Count } else { 0 })")
$kurz.Add("  Hardwarefehler (WHEA)  : $(if ($whea) { $whea.Count } else { 0 })")
$kurz.Add("  Plattenfehler          : $(if ($plattenFehler) { $plattenFehler.Count } else { 0 })")
$kurz.Add("  CompHub-Aufgabe        : $(if ($auf) { "vorhanden, Ergebnis $($info.LastTaskResult)" } else { 'FEHLT' })")
$kurz.Add('')
$kurz.Add('Darunter stehen die Einzelheiten.')

Set-Content -Path $Ziel -Value ($kurz + $Zeilen) -Encoding utf8

Write-Host ''
Write-Host "  Bericht geschrieben:" -ForegroundColor Green
Write-Host "  $Ziel" -ForegroundColor White
Write-Host ''
# Nur warten, wenn wirklich jemand davorsitzt. Beim Aufruf aus einem anderen
# Skript heraus gibt es keine Tastatur, und ReadKey wuerde dort scheitern.
if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    Write-Host '  Fenster schliesst sich mit einem Tastendruck.' -ForegroundColor DarkGray
    try { [void][System.Console]::ReadKey($true) } catch { }
}
