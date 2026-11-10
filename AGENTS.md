<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Hauptregel: Nie vorschnell "geht nicht" oder "fehlt" sagen (Betreiber, 10.11.2026)

Gilt fuer jede Sitzung und jeden Agenten. Mehrfach wurde gesagt "das gibt es nicht", "Epic hat das Replay nicht", "die Daten fehlen" - und am Ende war es doch da (zyfos Replay liess sich laden, die Steinschleuder-Treffer standen im Projektil, Brand-/Effekt-Schaden im Effekt-Ereignis). Das darf nicht wieder passieren.

1. **Keine endgueltige Aussage ohne mindestens drei verschiedene Versuche.** Bevor etwas als "nicht vorhanden", "nicht moeglich", "kaputt" oder "Datenluecke" gemeldet wird: andere Quelle, anderes Feld, anderer Zeitpunkt, erneuter Abruf, andere Bibliotheksfunktion, Rohdaten selbst ansehen. Ein einzelner Fehlschlag ist kein Beweis.
2. **Fehlschlaege erneut pruefen.** Ein Download/Abruf, der scheitert, wird spaeter noch einmal versucht, bevor er als "fehlt" gilt. Nie dauerhaft abhaken, nur weil es dreimal kurz hintereinander scheiterte.
3. **Unbekanntes aufschluesseln statt hinnehmen.** "Unbekannt", "ohne Ziel", "nicht zuordenbar" ist ein Arbeitsauftrag: nach Klasse, Pfad, Zeitpunkt und Gegenprobe (z. B. Lebensverlust des Opfers) zerlegen, bis klar ist, was es ist.
4. **Gegen eine Referenz pruefen.** Zahlen gelten erst als richtig, wenn sie gegen Osirion (oder eine andere unabhaengige Quelle) Spieler fuer Spieler stimmen - Ziel: hoechstens 0,1 % Abweichung, keine "ungefaehr"-Werte.
5. **Ehrlich unterscheiden:** "geprueft und bewiesen" vs. "vermutet". Eine Vermutung nie als Tatsache melden; lieber nachfragen oder weiter testen.
6. **Im Zweifel nachfragen** (beim Betreiber oder durch weitere Tests), statt aufzugeben.
