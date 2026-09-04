/*
 * Wo stehen noch deutsche Texte, die an der Uebersetzung vorbeigehen?
 *
 * Gesucht sind Zeichenketten, die im Browser landen, aber weder in <T>
 * stehen noch durch t() laufen. Zusammengesetzte Saetze (`${n} Spieltage`)
 * sind der haeufige Fall - <T> sieht sie nie.
 */
const fs = require('fs');
const datei = process.argv[2];
const z = fs.readFileSync(datei, 'utf8').split('\n');

const DEUTSCH = /\b(nicht|keine|kein|und|oder|von|für|mit|noch|schon|wird|werden|sind|ist|hat|haben|dieser|diese|dieses|alle|mehr|weniger|Spieler|Spieltag|Spieltage|Matches|Titel|besser|Werte|geladen|Saison|Platz|Punkte|Siege|Treffer|Schaden|Karte|Woche|Tag|Runde)\b/;

let inKommentar = false;
const treffer = [];
for (let i = 0; i < z.length; i += 1) {
  const zeile = z[i];
  const t = zeile.trim();
  // Blockkommentare ueberspringen
  if (t.startsWith('/*')) inKommentar = !t.includes('*/');
  if (inKommentar) { if (t.includes('*/')) inKommentar = false; continue; }
  if (t.startsWith('//') || t.startsWith('*')) continue;

  // Nur Zeilen mit einer Zeichenkette
  const strings = zeile.match(/'[^']{4,}'|`[^`]{4,}`/g) || [];
  for (const s of strings) {
    const inhalt = s.slice(1, -1);
    if (!DEUTSCH.test(inhalt)) continue;
    // Laeuft sie durch die Uebersetzung?
    if (/\bt\(\s*['`]/.test(zeile) && zeile.indexOf('t(' ) < zeile.indexOf(s)) continue;
    if (/uebs\(/.test(zeile)) continue;
    // Reine Schluessel/Klassen aussortieren
    if (/^[a-z-]+(\s[a-z-]+)*$/.test(inhalt) && !/ä|ö|ü|ß/.test(inhalt)) continue;
    if (/className|import |from '|\/api\/|https?:/.test(zeile)) continue;
    treffer.push(`${i + 1}: ${t.slice(0, 110)}`);
    break;
  }
}
console.log(`${datei}: ${treffer.length} verdaechtige Zeilen`);
treffer.slice(0, 40).forEach((x) => console.log('  ' + x));
