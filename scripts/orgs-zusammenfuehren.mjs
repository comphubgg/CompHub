/*
 * Die Orgs zusammenfuehren: was der Abgleich geaendert hat, auf den
 * aktuellen Stand der Seite legen - statt ihn zu ueberschreiben.
 *
 * Der Betreiber (1.10.2026): er hatte den Spielern der Orgs im Admin Fotos
 * und X-Konten eingetragen, und "wieso auch immer sind sie jetzt nicht mehr
 * da". Ursache: der Kader-Abgleich (.github/workflows/org-kader.yml) holt
 * orgs.json am Anfang, braucht gut eine Stunde (Liquipedia erlaubt eine Seite
 * je 30 Sekunden) und schreibt am Ende seinen ganzen Stand zurueck. Alles,
 * was der Betreiber in dieser Stunde eintrug, war damit wieder weg - am
 * 30.9. zwischen 15:52 und 17:53 Uhr in vier ueberlappenden Laeufen.
 *
 * Jetzt ein Dreiwege-Abgleich:
 *   basis   orgs.json, wie der Abgleich es am Anfang geholt hat
 *   meins   dasselbe nach dem Abgleich
 *   frisch  orgs.json, wie es jetzt in Supabase steht
 * Was der Abgleich gegenueber der Basis geaendert hat, kommt auf den frischen
 * Stand. Was der Betreiber zwischendurch geaendert hat, bleibt. Aenderten
 * beide dasselbe Feld, gewinnt der Betreiber. Was er geloescht hat, bleibt
 * geloescht.
 *
 *   node scripts/orgs-zusammenfuehren.mjs basis.json meins.json frisch.json ziel.json
 */

import fs from 'node:fs';

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const klein = (t) => String(t ?? '').toLowerCase();

/** Dasselbe Listenelement (Org, Spieler, Ehemaliger)? Zuerst ueber Kennung, sonst ueber den Namen. */
function selbe(a, b) {
  if (!istObjekt(a) || !istObjekt(b)) return false;
  if (a.id && b.id) return a.id === b.id;
  if (a.epicId && b.epicId) return a.epicId === b.epicId;
  return !!a.name && klein(a.name) === klein(b.name);
}

const finde = (liste, x) => liste.find((y) => selbe(x, y));

/** Eine Liste von Objekten (mit Kennung oder Namen) dreifach abgleichen. */
function liste(basis, meins, frisch) {
  const raus = frisch.map((t) => {
    const m = finde(meins, t);
    const b = finde(basis, t);
    // Der Abgleich kennt ihn nicht (mehr): nur behalten, wenn er schon in der Basis fehlte.
    if (!m) return b && gleich(b, t) ? null : t;
    if (!b) return t; // neu beim Betreiber und beim Abgleich: der Betreiber gewinnt
    return dreiwege(b, m, t);
  }).filter((x) => x !== null);
  // Neu durch den Abgleich - es sei denn, der Betreiber hat es inzwischen selbst angelegt.
  for (const m of meins) {
    if (finde(basis, m) || finde(raus, m)) continue;
    raus.push(m);
  }
  return raus;
}

/** Ob eine Liste aus Objekten besteht, die sich zuordnen lassen. */
const zuordenbar = (l) => Array.isArray(l) && l.length > 0
  && l.every((x) => istObjekt(x) && (x.id || x.epicId || x.name));

export function dreiwege(basis, meins, frisch) {
  if (gleich(meins, basis)) return frisch; // der Abgleich hat hier nichts getan
  if (gleich(frisch, basis)) return meins; // der Betreiber hier nichts
  if (istObjekt(basis) && istObjekt(meins) && istObjekt(frisch)) {
    const raus = {};
    for (const k of new Set([...Object.keys(frisch), ...Object.keys(meins), ...Object.keys(basis)])) {
      const v = dreiwege(basis[k], meins[k], frisch[k]);
      if (v !== undefined) raus[k] = v;
    }
    return raus;
  }
  if (Array.isArray(meins) && Array.isArray(frisch)
    && (zuordenbar(meins) || meins.length === 0) && (zuordenbar(frisch) || frisch.length === 0)) {
    return liste(Array.isArray(basis) ? basis : [], meins, frisch);
  }
  return frisch; // beide haben dasselbe Feld geaendert: der Betreiber gewinnt
}

function main() {
  const [basisDatei, meinsDatei, frischDatei, ziel] = process.argv.slice(2);
  if (!ziel) { console.error('Aufruf: node scripts/orgs-zusammenfuehren.mjs basis meins frisch ziel'); process.exit(1); }
  const [basis, meins, frisch] = [basisDatei, meinsDatei, frischDatei].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const gemeinsam = dreiwege(basis, meins, frisch);
  // Der Stempel des Abgleichs bleibt, wie er war.
  if (istObjekt(gemeinsam) && meins?.stand) gemeinsam.stand = meins.stand;
  fs.writeFileSync(ziel, JSON.stringify(gemeinsam, null, 1));
  const zaehle = (o) => (o?.orgs ?? o ?? []).reduce((a, x) => a + (x.spieler?.length ?? 0), 0);
  console.log(`Zusammengefuehrt: ${(gemeinsam.orgs ?? gemeinsam).length} Orgs, ${zaehle(gemeinsam)} Spieler `
    + `(Basis ${zaehle(basis)}, Abgleich ${zaehle(meins)}, frisch ${zaehle(frisch)})`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) main();
