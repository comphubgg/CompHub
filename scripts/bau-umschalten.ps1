# Den neuen Bau (.next-bau) an die Stelle des laufenden (.next) setzen - nur aufrufen, wenn der Server steht.
#
# Gebaut wird daneben (scripts/bauen-daneben.mjs), damit der Server waehrend des Bauens seine Dateien behaelt (28.10.2026: vorher bei jedem Veroeffentlichen
# zehn Minuten 500 auf /maps, /replays ...). Hier wird nur umbenannt - .next wird zu .next-alt, .next-bau zu .next -, das dauert Sekunden. Klappt das nicht
# (eine Datei ist noch gesperrt), bleibt der alte Bau stehen und wird weiter ausgeliefert; die Meldung sagt es.
#
# Aufruf (dot-source):  . (Join-Path $PSScriptRoot 'bau-umschalten.ps1'); $text = BauUmschalten $Projekt

function BauUmschalten([string]$Projekt) {
    $neu = Join-Path $Projekt '.next-bau'
    $jetzt = Join-Path $Projekt '.next'
    $alt = Join-Path $Projekt '.next-alt'
    if (-not (Test-Path (Join-Path $neu 'BUILD_ID'))) { return 'Kein neuer Bau in .next-bau - es bleibt beim Bau in .next.' }

    # Ein Rest vom letzten Umschalten kommt weg; was davon gesperrt ist, bleibt liegen und wird beim naechsten Mal entfernt.
    if (Test-Path $alt) { Remove-Item -Path $alt -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path $alt) { $alt = Join-Path $Projekt (".next-alt-" + (Get-Date -Format 'yyyyMMddHHmmss')) }

    for ($versuch = 1; $versuch -le 5; $versuch++) {
        try {
            if (Test-Path $jetzt) { Rename-Item -Path $jetzt -NewName (Split-Path $alt -Leaf) -ErrorAction Stop }
            try {
                Rename-Item -Path $neu -NewName '.next' -ErrorAction Stop
                return "Umgeschaltet: der neue Bau liegt jetzt in .next (der vorige in $(Split-Path $alt -Leaf))."
            } catch {
                # Zurueck, damit nicht gar kein Bau unter .next liegt.
                if ((Test-Path $alt) -and -not (Test-Path $jetzt)) { Rename-Item -Path $alt -NewName '.next' -ErrorAction SilentlyContinue }
                throw
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    return 'Umschalten gescheitert (eine Datei in .next ist noch gesperrt) - ausgeliefert wird weiter der vorige Bau; der neue liegt in .next-bau.'
}
