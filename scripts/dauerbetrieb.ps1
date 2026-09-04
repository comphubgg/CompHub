# Haelt CompHub und den Tunnel am Laufen.
#
# Der Ausfall, den das hier verhindert, sah so aus: der Webserver lief als Kind
# eines Terminalfensters. Sobald das Fenster zuging, war er weg - der Tunnel
# stand noch, fand aber niemanden mehr und Cloudflare zeigte allen "Bad
# gateway". Von aussen sieht das aus, als waere das Werkzeug kaputt.
#
# Deshalb laeuft hier keine Ueberwachung im eigentlichen Sinn, sondern eine
# einfache Frage im Takt: lauscht jemand auf dem Port, und haelt der Tunnel eine
# Verbindung? Wenn nein, wird gestartet. Das faengt jeden Fall ab - Absturz,
# geschlossenes Fenster, Neustart des Rechners - ohne dass jemand daran denken
# muss.
#
# Der oeffentliche Server hoert bewusst auf 3100, nicht auf 3000. Auf 3000
# arbeitet der Entwicklungsserver, und die beiden duerfen sich nicht in die
# Quere kommen: sonst nimmt der eine dem anderen den Port weg und die
# oeffentliche Seite zeigt einen halbfertigen Stand.
#
# Nichts ist hier fest auf einen Rechner geschrieben. Das Skript findet den
# Projektordner ueber seinen eigenen Ort und die Tunneleinstellungen ueber eine
# kurze Suche - damit laeuft dieselbe Datei auf dem PC (Konto "jumik") und auf
# dem Laptop (Konto "diabo"), ohne dass jemand Pfade anpasst.

$ErrorActionPreference = 'SilentlyContinue'

# ------------------------------------------------------------------- Orte

# Das Skript liegt in <Projekt>\scripts, der Projektordner ist also eine Ebene
# darueber. Unter dem Systemkonto gibt es kein Benutzerverzeichnis, an dem man
# sich orientieren koennte - der eigene Ort ist der einzige verlaessliche.
$Projekt = Split-Path -Parent $PSScriptRoot
$Port     = 3100
# Welcher Tunnel gestartet wird, entscheidet die Einstellungsdatei selbst
# (die Zeile "tunnel:" darin). Frueher stand hier fest "comphub" - auf dem
# Laptop heisst er aber "comphub-laptop", und der Start scheiterte still.
# Woran unser Tunnel zu erkennen ist.
#
# Nach dem Namen des Programms zu suchen genuegt nicht: auf dem PC liegt
# zusaetzlich der Windows-Dienst "Cloudflared", der ohne Einstellungsdatei
# gestartet wurde und deshalb nichts ausliefert. Er heisst aber genauso. Wer
# nur nach dem Prozess sieht, haelt ihn fuer einen laufenden Tunnel und startet
# nie den richtigen - genau daran hing der "Bad gateway". Unserer bekommt darum
# einen festen Messport, den sonst niemand belegt.
$MessPort = 20999
$Protokoll = Join-Path $Projekt 'dauerbetrieb.log'

function Notiere($text) {
    $zeile = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $text
    Add-Content -Path $Protokoll -Value $zeile -Encoding utf8
    # Das Protokoll darf nicht unbegrenzt wachsen - es laeuft alle zwei
    # Minuten, das waeren im Jahr eine Viertelmillion Zeilen.
    $inhalt = Get-Content $Protokoll -ErrorAction SilentlyContinue
    if ($inhalt.Count -gt 2000) {
        Set-Content -Path $Protokoll -Value ($inhalt | Select-Object -Last 800) -Encoding utf8
    }
}

# Die erste Datei, die es wirklich gibt.
function ErsteVorhandene([string[]]$pfade) {
    foreach ($p in $pfade) { if ($p -and (Test-Path $p)) { return $p } }
    return $null
}

# Was beim Einrichten gefunden wurde.
#
# Der Waechter laeuft unter dem Systemkonto, das Einrichten dagegen unter dem
# angemeldeten Benutzer. Wer cloudflared per winget installiert, bekommt es
# nach C:\Users\<name>\AppData\Local - und dort sucht das Systemkonto nicht.
# Genau daran scheiterte der Tunnel auf dem Laptop: der Webserver lief, der
# Tunnel nicht, und im Protokoll stand "cloudflared ist nicht installiert",
# obwohl es dalag. Deshalb schreibt das Einrichten die gefundenen Orte in eine
# Datei, und hier werden sie zuerst gelesen.
$Orte = $null
$OrteDatei = Join-Path $Projekt 'dauerbetrieb-orte.json'
if (Test-Path $OrteDatei) {
    try { $Orte = Get-Content $OrteDatei -Raw | ConvertFrom-Json } catch { $Orte = $null }
}

# Zusaetzlich jedes Benutzerprofil durchsehen - winget legt die Verknuepfung
# je Benutzer an, nicht fuer den ganzen Rechner.
$WingetLinks = @(Get-ChildItem -Path "C:\Users\*\AppData\Local\Microsoft\WinGet\Links\cloudflared.exe" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })

$Cloudflared = ErsteVorhandene (@(
    $(if ($Orte) { $Orte.cloudflared }),
    'C:\Program Files (x86)\cloudflared\cloudflared.exe',
    'C:\Program Files\cloudflared\cloudflared.exe',
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\cloudflared.exe'),
    (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
) + $WingetLinks)

# Die Tunneleinstellungen liegen im Benutzerverzeichnis dessen, der sich
# angemeldet hat - und das ist auf jedem Rechner ein anderes. Unter dem
# Systemkonto zeigt $env:USERPROFILE ins Leere, deshalb werden die bekannten
# Konten zusaetzlich durchgesehen.
# Dieselbe Frage fuer die Tunneleinstellungen: sie liegen im Verzeichnis des
# angemeldeten Benutzers, und unter dem Systemkonto zeigt $env:USERPROFILE
# woanders hin. Deshalb erst der beim Einrichten vermerkte Ort, dann die
# ueblichen, und zuletzt jedes Benutzerprofil.
$AlleProfile = @(Get-ChildItem -Path "C:\Users\*\.cloudflared\config.yml" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })

$Konfig = ErsteVorhandene (@(
    $(if ($Orte) { $Orte.konfig }),
    (Join-Path $Projekt '.cloudflared\config.yml'),
    (Join-Path $env:USERPROFILE '.cloudflared\config.yml')
) + $AlleProfile)

# ------------------------------------------------------------- Nachsehen

function LauschtJemand($p) {
    $treffer = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    return [bool]$treffer
}

# ------------------------------------------------------------- Der Webserver

if (-not (LauschtJemand $Port)) {
    if (-not (Test-Path (Join-Path $Projekt '.next\BUILD_ID'))) {
        Notiere "Kein fertiger Bau vorhanden - bitte einmal 'npm run veroeffentlichen' laufen lassen."
    } else {
        Notiere "Webserver auf $Port war weg, wird gestartet."
        Start-Process -FilePath 'node.exe' `
            -ArgumentList 'node_modules\next\dist\bin\next', 'start', '-H', '0.0.0.0', '-p', "$Port" `
            -WorkingDirectory $Projekt -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $Projekt 'server.log') `
            -RedirectStandardError  (Join-Path $Projekt 'server-fehler.log')
    }
}

# ----------------------------------------------------------------- Der Tunnel

if (-not (LauschtJemand $MessPort)) {
    if (-not $Cloudflared) {
        Notiere 'cloudflared ist auf diesem Rechner nicht installiert.'
    } elseif (-not $Konfig) {
        Notiere 'Keine Tunneleinstellungen gefunden (.cloudflared\config.yml).'
    } else {
        Notiere "Tunnel war weg, wird gestartet (Einstellungen: $Konfig)."
        Start-Process -FilePath $Cloudflared `
            -ArgumentList 'tunnel', '--config', $Konfig, '--metrics', "127.0.0.1:$MessPort", 'run' `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $Projekt 'tunnel-aus.log') `
            -RedirectStandardError  (Join-Path $Projekt 'tunnel.log')
    }
}
