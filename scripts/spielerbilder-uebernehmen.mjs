// Vorhandene Spielerfotos ins Werkzeug uebernehmen.
//
// Der Nutzer sammelt Fotos unter dem Profinamen: "SHXRK.webp", "AJERSS.webp".
// Das Werkzeug fuehrt Spieler aber ueber die Epic-Konto-Id, und der Name, unter
// dem jemand im Turnier antritt, ist ein anderer: AJERSS heisst dort "GEN aj",
// SHXRK mal "AURA shxrk" und mal "aurora fv".
//
// Dieses Skript schlaegt die Bruecke. Ein Foto wird einem Konto zugeordnet,
// wenn einer dieser Wege traegt - in dieser Reihenfolge:
//
//   1. ein selbst gepflegtes Profil (Anzeigename oder bekannte Namen)
//   2. die offene Spielerliste der Szene-Quelle (Klarname -> Konto-Id)
//   3. ein Turniername aus dem eigenen Archiv
//
// Trifft keiner, wird die Datei nicht kopiert und am Ende benannt - dann
// gehoert sie von Hand zugeordnet. Lieber ein Foto zu wenig als das Gesicht
// des falschen Spielers.
//
// Aufruf:  node scripts/spielerbilder-uebernehmen.mjs <Ordner> [--probe]
//          --probe zeigt nur, was passieren wuerde.

import { promises as fs } from 'fs';
import path from 'path';
// Die Normalisierung aus lib/homoglyph, hier schlank nachgebaut: ein
// .mjs-Skript kann kein TypeScript einlesen, und gebraucht wird nur der
// Namensschluessel - alles ausser Buchstaben und Ziffern faellt weg.
function namensSchluessel(name) {
  return (name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toLowerCase();
}

const ARCHIV = path.join(process.cwd(), 'data', 'szene-stats');
const BILDER = path.join(process.cwd(), 'public', 'spielerbilder');
const LISTE = path.join(process.cwd(), 'data', 'spielerbilder.json');
const FREMDLISTE = 'https://eucompetitive.com/get_players_all.php';

const argumente = process.argv.slice(2);
const probe = argumente.includes('--probe');
const quelle = argumente.find((a) => !a.startsWith('--'));

if (!quelle) {
  console.error('Aufruf: node scripts/spielerbilder-uebernehmen.mjs <Ordner> [--probe]');
  process.exit(1);
}

const KOPF = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

async function main() {
  /* ------------------------------------------------ Wege zur Konto-Id */

  // 1. Eigene Profile
  const eigene = new Map();   // Namensschluessel -> Menge von Konto-Ids
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(process.cwd(), 'data', 'spieler-profile.json'), 'utf8'));
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (!id) continue;
      for (const n of [pr.anzeige, pr.name, ...(pr.namen ?? [])].filter(Boolean)) {
        const k = namensSchluessel(n);
        if (!eigene.has(k)) eigene.set(k, new Set());
        eigene.get(k).add(id);
      }
    }
  } catch { /* noch keine */ }

  // 2. Die offene Spielerliste der Quelle - dort steht der Klarname.
  //    Zuerst die eigene Kopie, dann erst das Netz: die Liste aendert sich
  //    selten, und der Anbieter antwortet nicht immer.
  const fremde = new Map();
  const ablage = path.join(process.cwd(), 'data', 'szene-quelle', 'spielerliste.json');
  let liste = null;
  try {
    liste = JSON.parse(await fs.readFile(ablage, 'utf8'));
  } catch {
    try {
      const r = await fetch(FREMDLISTE, { headers: KOPF });
      const text = await r.text();
      if (text.trim().startsWith('[')) {
        liste = JSON.parse(text);
        await fs.mkdir(path.dirname(ablage), { recursive: true });
        await fs.writeFile(ablage, text, 'utf8');
      }
    } catch (e) {
      console.warn('Spielerliste der Quelle nicht erreichbar:', e.message);
    }
  }
  if (Array.isArray(liste)) {
    for (const p of liste) {
      if (!p.ID || !p.NAME) continue;
      const k = namensSchluessel(p.NAME);
      if (!fremde.has(k)) fremde.set(k, new Set());
      fremde.get(k).add(p.ID);
    }
    console.log(`Klarnamen der Quelle: ${fremde.size}`);
  }

  // 3. Turniernamen aus dem eigenen Archiv - und wie oft jedes Konto antritt.
  //    Die Zahl entscheidet spaeter, welches von mehreren Konten das Foto
  //    bekommt: das, das wirklich spielt.
  const turniernamen = new Map();
  const auftritte = new Map();
  const verzeichnis = JSON.parse(
    await fs.readFile(path.join(ARCHIV, 'index.json'), 'utf8'));
  for (const e of verzeichnis) {
    let datei;
    try {
      datei = JSON.parse(await fs.readFile(
        path.join(ARCHIV, e.region, e.season, e.datei), 'utf8'));
    } catch { continue; }
    for (const p of datei.players) {
      if (!p.epicId) continue;
      auftritte.set(p.epicId, (auftritte.get(p.epicId) ?? 0) + (p.matchesPlayed || 0));
      if (p.username) {
        const k = namensSchluessel(p.username);
        if (!turniernamen.has(k)) turniernamen.set(k, new Set());
        turniernamen.get(k).add(p.epicId);
      }
    }
  }
  console.log(`Turniernamen im Archiv: ${turniernamen.size}`);

  /* ---------------------------------------------------- Dateien pruefen */

  /**
   * Nur was wie ein Spielername aussieht.
   *
   * In einem Downloadordner liegen sonst Logos, Bildschirmfotos und
   * Kennungen herum. Frueher stand hier eine Zeichenliste aus A-Z und
   * Ziffern - und die warf ausgerechnet "DEMUŚ.jpg" weg, weil das Ś nicht
   * darin vorkam. Gemessen wird deshalb am Namensschluessel: was danach
   * zwei bis vierundzwanzig Zeichen ergibt, ist ein brauchbarer Name,
   * gleich in welcher Schrift er geschrieben steht.
   */
  const dateien = (await fs.readdir(quelle))
    .filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f))
    .filter((f) => {
      const roh = f.replace(/(\.(webp|png|jpe?g))+$/i, '');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(roh)) return false;
      const k = namensSchluessel(roh.replace(/\s*\(\d+\)$/, ''));
      return k.length >= 2 && k.length <= 24;
    });

  /**
   * Namen, die kein Spieler sind.
   *
   * In einem Downloadordner liegen Bildschirmfotos und Grafiken herum, und
   * die Spielerliste der Quelle enthaelt zufaellig Konten, die "IMAGE" oder
   * "LOGO" heissen. Ohne diese Sperre bekaeme ein Bildschirmfoto das Gesicht
   * eines Spielers zugewiesen - oder umgekehrt.
   */
  const GESPERRT = new Set([
    'image', 'images', 'logo', 'banner', 'screenshot', 'bild', 'foto',
    'unbenannt', 'unknown', 'download', 'grafik', 'icon', 'avatar',
  ]);

  const uebernommen = [];
  const offen = [];

  for (const datei of dateien) {
    // Doppelte Endungen abstreifen: "FASTROKI.png.jpg" ist FASTROKI.
    // Und die Dublettenmarke, die Windows anhaengt: "DANICUSH (1)".
    const name = datei
      .replace(/(\.(webp|png|jpe?g))+$/i, '')
      .replace(/\s*\(\d+\)$/, '');
    const schluessel = namensSchluessel(name);
    if (GESPERRT.has(schluessel)) continue;
    /**
     * Welches Konto bekommt das Foto?
     *
     * Drei Regeln, und die Reihenfolge ist der Kern der Sache. Jede einzelne
     * ist aus einem Fehler entstanden, und jede fuer sich allein war falsch:
     *
     * 1. Tote Konten fallen weg. Wer im ganzen Archiv kein einziges Match
     *    hat, bekommt kein Foto, solange ein anderer Kandidat spielt.
     *    - Malibuca: zwei Konten, eines mit 319 Matches, eines nie im
     *      Archiv. Das Foto landete auf dem toten und war nirgends zu sehen.
     *    - Kaan: die Quelle nennt ein Konto "KAAN", das im Archiv nicht
     *      vorkommt; gespielt hat unter diesem Namen ein anderes mit 353
     *      Matches.
     *
     * 2. Dann zaehlt die Herkunft des Namens. Ein gepflegtes Profil ist eine
     *    Ansage; der Klarname der Quelle ist eine Angabe ueber genau dieses
     *    Konto; ein Turniername ist nur ein Nickname, unter dem irgendwer
     *    irgendwann einmal angetreten ist.
     *    - Robin: die Quelle nennt Konto 419ac5be "ROBIN". Ein voellig
     *      anderer Spieler - in der Quelle "PIKA" - trat einmal als
     *      "Roebin!" an und hat mehr Matches. Ohne diese Regel gewann er.
     *
     * 3. Erst innerhalb derselben Herkunft entscheidet, wer mehr spielt.
     *
     * Regel 1 vor Regel 2 ist wichtig: eine Angabe der Quelle ueber ein
     * Konto, das nie antritt, ist keine bessere Auskunft als ein Nickname
     * von jemandem, der jede Woche spielt.
     */
    const nachHerkunft = [
      [...(eigene.get(schluessel) ?? [])],
      [...(fremde.get(schluessel) ?? [])],
      [...(turniernamen.get(schluessel) ?? [])],
    ];
    const kandidaten = new Set(nachHerkunft.flat());
    if (!kandidaten.size) { offen.push(name); continue; }

    const lebt = (id) => (auftritte.get(id) ?? 0) > 0;
    const esGibtLebende = [...kandidaten].some(lebt);
    const gefiltert = nachHerkunft.map((gruppe) =>
      (esGibtLebende ? gruppe.filter(lebt) : gruppe));

    const beste = gefiltert.find((gruppe) => gruppe.length) ?? [];
    const id = [...beste]
      .sort((a, b) => (auftritte.get(b) ?? 0) - (auftritte.get(a) ?? 0))[0];
    const weg = (eigene.get(schluessel)?.has(id) ? 'eigenes Profil'
      : fremde.get(schluessel)?.has(id) ? 'Klarname der Quelle' : 'Turniername')
      + (kandidaten.size > 1 ? `, ${kandidaten.size} Konten` : '');
    const alter = (await fs.stat(path.join(quelle, datei))).mtimeMs;
    uebernommen.push({ datei, name, epicId: id, weg, alter });
  }

  // Zwei Dateien fuer dasselbe Konto? Die neuere gewinnt - sie ist die,
  // die er zuletzt gesucht hat.
  const jeKonto = new Map();
  for (const u of uebernommen.sort((a, b) => a.alter - b.alter)) jeKonto.set(u.epicId, u);
  uebernommen.length = 0;
  uebernommen.push(...jeKonto.values());
  uebernommen.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\n${uebernommen.length} von ${dateien.length} Fotos zugeordnet:`);
  for (const u of uebernommen) {
    console.log(`  ${(u.name + '            ').slice(0, 14)} -> ${u.epicId.slice(0, 8)}…  (${u.weg})`);
  }
  if (offen.length) {
    console.log(`\nOhne Zuordnung (${offen.length}): ${offen.join(', ')}`);
  }
  if (probe) { console.log('\nNur Probe - nichts kopiert.'); return; }

  /* ------------------------------------------------------------ Kopieren */

  await fs.mkdir(BILDER, { recursive: true });
  let bekannt = [];
  try { bekannt = JSON.parse(await fs.readFile(LISTE, 'utf8')); } catch { /* leer */ }
  const nachId = new Map(bekannt.map((e) => [e.epicId, e]));

  /**
   * Der Dateiname bleibt bei den einfachen Zeichen.
   *
   * "demuś.jpg" liegt zwar sauber auf der Platte, wird aber nur ueber eine
   * kodierte Adresse ausgeliefert - unkodiert antwortet der Server mit 404.
   * Der Anzeigename traegt das Sonderzeichen ohnehin; die Datei braucht es
   * nicht.
   */
  const dateiSchreibweise = (name) => name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'spieler';

  for (const u of uebernommen) {
    const endung = path.extname(u.datei).toLowerCase();
    const ziel = `${dateiSchreibweise(u.name)}${endung}`;
    await fs.copyFile(path.join(quelle, u.datei), path.join(BILDER, ziel));

    /*
     * Den Platzhalter dieses Kontos abloesen, falls einer da war.
     *
     * Verglichen wird ohne Ruecksicht auf Gross- und Kleinschreibung. Unter
     * Windows ist "VICO.jpg" dieselbe Datei wie "vico.jpg": das Kopieren
     * schreibt in die vorhandene Datei, und ein anschliessendes Loeschen des
     * "alten" Namens loescht genau das eben geschriebene Foto wieder. So
     * sind einmal einundfuenfzig Bilder verschwunden - kopiert und im
     * selben Durchgang geloescht.
     */
    const alt = nachId.get(u.epicId);
    if (alt && alt.datei.toLowerCase() !== ziel.toLowerCase()) {
      try { await fs.unlink(path.join(BILDER, alt.datei)); } catch { /* schon weg */ }
    }

    /**
     * Dieselbe Datei nie zwei Konten zuschreiben.
     *
     * Wandert ein Foto auf ein anderes Konto - etwa weil die Wahl jetzt nach
     * Auftritten geht -, bleibt beim alten Konto sonst ein Eintrag stehen,
     * der auf dieselbe Datei zeigt. In der Galerie erschien der Spieler
     * dadurch doppelt, einmal unter jedem seiner Konten.
     */
    for (const [id, e] of nachId) {
      if (id !== u.epicId && e.datei === ziel) nachId.delete(id);
    }
    nachId.set(u.epicId, {
      ...(alt ?? {}), datei: ziel, epicId: u.epicId, name: alt?.name ?? u.name,
      echtesFoto: true,
    });
  }

  await fs.writeFile(LISTE, JSON.stringify([...nachId.values()], null, 1), 'utf8');
  // Die Schlusszeile nennt, was benutzt wurde - nicht, wie viele Zeilen die
  // Liste hat. Die enthaelt naemlich auch Silhouetten, und wer "402
  // Eintraege" liest, sucht danach vergeblich nach 402 Fotos.
  const echte = [...nachId.values()].filter((x) => x.echtesFoto).length;
  console.log(`\n${uebernommen.length} von ${dateien.length} Dateien zugeordnet.`);
  console.log(`Spieler mit echtem Foto: ${echte}.`);
  if (offen.length) {
    console.log(`Ohne Zuordnung (${offen.length}): `
      + offen.slice(0, 10).join(', ') + (offen.length > 10 ? ' …' : ''));
  }
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
