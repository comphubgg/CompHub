/*
 * Die Berechtigungen (Epic nennt sie "Bereiche"), die CompHub beim Verknuepfen eines Epic-Kontos beantragt.
 *
 * Epic verlangt in jeder Genehmigungsanfrage ALLE Berechtigungen, die im Epic-Portal fuer die Anwendung freigeschaltet sind
 * ("Fehlende Berechtigungen: Land, Freundesliste, Praesenz - nicht beantragt", 14.10.2026). Beantragt der Hinweg nur das
 * Basisprofil, bleibt die Verknuepfung stecken: der Spieler kommt zurueck, aber der Austausch des Codes schlaegt fehl.
 * Stimmen Portal und Liste hier nicht ueberein, ist das der erste Ort, an dem man nachsieht.
 *
 *   basic_profile  Konto-Id und Anzeigename - der Beweis, wer jemand ist
 *   friends_list   die Freundesliste, fuer das Freunde-Leaderboard
 *   presence       von Epic mitverlangt, wird nicht benutzt
 *   country        von Epic mitverlangt, wird nicht benutzt
 */
export const EPIC_BEREICHE = 'basic_profile friends_list presence country';
