/*
 * Trefferorte in alten Replay-Dateien mal 10 nehmen (16.11.2026) - reine Funktion, im Browser wie auf dem Server nutzbar.
 *
 * Der Fehler: tools/replay-voll las bis Fassung 16 den Ort eines Treffers (BatchedDamageCues.Location) mit Massstab 100, Fortnite schickt ihn mit Massstab 10.
 * Jeder Trefferort kam genau zehnmal zu nah am Ursprung heraus, in x, y und Hoehe (-302/2358 statt -3020/23580). Betroffen:
 *   schuesse  jeder Eintrag (auch Treffer auf Bauteile - sie kommen aus demselben Feld; NonPlayerLocation ist im Strom leer)
 *   orte      jeder Ort, der von einem Treffer auf den Spieler stammt (rund 4-7 % aller Orte)
 * Seit Fassung 17 liest der Leser richtig und schreibt trefferOrtMassstab: 10 in die Datei. Was davor am Release liegt, laesst sich ohne das Replay
 * (Epic loescht es nach 31 Tagen) nicht neu lesen - deshalb hier beim Laden.
 *
 * Kein Raten an Nachbarn: ein Trefferort in "orte" steht mit genau derselben Zeit (0,1 s) und genau demselben x/y (ganze Zahl) auch in "schuesse" (Art 1/2),
 * beide schreibt SchussNotieren aus demselben Wert. Ob eine Datei den Fehler hat, entscheidet das Match selbst: Schuesse, deren Schuetze binnen 3 s einen
 * eigenen (Nicht-Treffer-)Ort hat, liegen bei betroffenen Dateien mal 10 dicht bei ihm, sonst so wie sie sind. Erst wenn das klar fuer mal 10 spricht
 * (mindestens 10 Faelle, neunmal so viele dafuer wie dagegen), wird korrigiert.
 *
 * Geprueft an FNCS Solo Reload Heat 1 EU, vier Matches, alte Datei gegen die mit dem berichtigten Leser neu gelesene: 1.361 von 1.361 Trefferorten und
 * 58.388 von 58.388 Schuessen richtig mal 10, kein anderer Punkt angefasst; an den neu gelesenen schlaegt die Pruefung nicht an (0 dafuer, ~3.000 dagegen).
 */

/** Ab dieser Naehe zum Ursprung ist ein Ort etwas anderes (Ort relativ zu dem, worauf der Spieler steht) und taugt nicht als Vergleich. */
const NAH_AM_URSPRUNG = 3000;

/**
 * @template T
 * @param {T} m ein Match im Format von tools/replay-voll (orte, schuesse)
 * @returns {T} dasselbe Match, Trefferorte wenn noetig mal 10 (ein neues Objekt; m bleibt unveraendert)
 */
export function trefferOrteKorrigiert(m) {
  const d = /** @type {{ trefferOrtMassstab?: number, orte?: Record<string, number[][]>, schuesse?: number[][] }} */ (/** @type {unknown} */ (m));
  if (!d || d.trefferOrtMassstab === 10 || !Array.isArray(d.schuesse) || !d.schuesse.length) return m;
  const urteil = trefferOrtUrteil(d);
  if (!urteil.betroffen) return m;
  const treffer = trefferSchluessel(d.schuesse);
  /** @type {Record<string, number[][]>} */
  const orte = {};
  for (const [k, l] of Object.entries(d.orte ?? {})) {
    orte[k] = l.map((p) => (treffer.has(schluessel(p[0], p[1], p[2])) ? [p[0], p[1] * 10, p[2] * 10, ...(p.length > 3 ? [p[3] * 10, ...p.slice(4)] : [])] : p));
  }
  const schuesse = d.schuesse.map((s) => [s[0], s[1], s[2] * 10, s[3] * 10, ...s.slice(4)]);
  return /** @type {T} */ (/** @type {unknown} */ ({ ...d, orte, schuesse, trefferOrtMassstab: 10, trefferOrtNachtraeglich: true }));
}

/**
 * Wie die Schuesse eines Matches zu ihren Schuetzen liegen: dafuer = mal 10 liegt mindestens dreimal so nah am Schuetzen, dagegen = umgekehrt.
 * @param {{ orte?: Record<string, number[][]>, schuesse?: number[][] }} d
 */
export function trefferOrtUrteil(d) {
  const sch = d.schuesse ?? [];
  const treffer = trefferSchluessel(sch);
  /** @type {Map<number, number[][]>} eigene Orte je Spieler (ohne Trefferorte, ohne Orte am Ursprung), nach Zeit */
  const eigene = new Map();
  for (const [k, l] of Object.entries(d.orte ?? {})) {
    eigene.set(Number(k), l.filter((p) => !treffer.has(schluessel(p[0], p[1], p[2])) && Math.hypot(p[1], p[2]) > NAH_AM_URSPRUNG).sort((a, b) => a[0] - b[0]));
  }
  let dafuer = 0; let dagegen = 0;
  for (const s of sch) {
    const l = eigene.get(s[1]); if (!l || !l.length) continue;
    const b = naechster(l, s[0]); if (!b || Math.abs(b[0] - s[0]) > 3) continue;
    const d1 = Math.hypot(s[2] - b[1], s[3] - b[2]); const d10 = Math.hypot(s[2] * 10 - b[1], s[3] * 10 - b[2]);
    if (d10 * 3 < d1) dafuer += 1; else if (d1 * 3 < d10) dagegen += 1;
  }
  return { dafuer, dagegen, betroffen: dafuer >= 10 && dafuer >= 9 * dagegen };
}

/** @param {number} t @param {number} x @param {number} y */
const schluessel = (t, x, y) => `${t}|${x}|${y}`;

/** Zeit und Ort jedes Treffers auf einen Spieler (Art 1 und 2) - so steht er auch in "orte". @param {number[][]} sch */
function trefferSchluessel(sch) {
  const s = new Set();
  for (const x of sch) if (x[5] > 0) s.add(schluessel(x[0], x[2], x[3]));
  return s;
}

/** Der zeitlich naechste Eintrag einer nach Zeit sortierten Liste. @param {number[][]} l @param {number} t */
function naechster(l, t) {
  let lo = 0; let hi = l.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (l[mid][0] < t) lo = mid + 1; else hi = mid; }
  const a = l[lo]; const b = l[lo - 1];
  return b && Math.abs(b[0] - t) <= Math.abs(a[0] - t) ? b : a;
}
