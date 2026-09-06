// Nachsehen, wer sich umbenannt hat.
//
//   node scripts/namen-pruefen.mjs             -> nur berichten
//   node scripts/namen-pruefen.mjs --schreiben -> neue Schreibweisen mitfuehren
//
// Warum es das gibt: Fortnite-Profis benennen sich alle paar Wochen um. Das
// eigene Archiv kennt nur den Namen, unter dem jemand an einem Turniertag
// angetreten ist - und den gepflegten Anzeigenamen, den der Betreiber selbst
// gesetzt hat. Was heute im Spiel steht, weiss beides nicht.
//
// fortnite-api.com nennt zu einer Epic-Konto-Id den aktuellen Namen. Die
// Zuordnung geht ueber die Id, nie ueber den Namen - sie ist also eindeutig
// und bleibt es auch nach der naechsten Umbenennung.
//
// WICHTIG: Der gepflegte Anzeigename wird nie ueberschrieben. Er ist die
// Entscheidung des Betreibers ("der heisst nicht GEN RITUALX 9, sondern
// ritual") und gilt vor allem, was irgendeine Quelle meldet. Geschrieben
// wird ausschliesslich die Liste der bekannten Schreibweisen in
// data/spieler-namen.json, damit die Suche einen Spieler auch unter seinem
// neuen Namen findet.

import { promises as fs } from 'fs';
import path from 'path';

const SCHREIBEN = process.argv.slice(2).includes('--schreiben');
const ORT = path.join(process.cwd(), 'data');
const SCHLUESSEL = process.env.FORTNITE_API_KEY || '';

/** Gleich genug? Gross- und Kleinschreibung und Zierrat zaehlen nicht. */
function gleich(a, b) {
  const rein = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return rein(a) === rein(b);
}

async function lies(datei) {
  return JSON.parse(await fs.readFile(path.join(ORT, datei), 'utf8'));
}

async function nameZu(id) {
  const r = await fetch(`https://fortnite-api.com/v2/stats/br/v2/${id}`,
    { headers: { Authorization: SCHLUESSEL } });
  if (r.status === 403) return { stand: 'privat' };
  if (r.status === 404) return { stand: 'unbekannt' };
  if (!r.ok) return { stand: `HTTP ${r.status}` };
  const j = await r.json();
  return { stand: 'ok', name: j?.data?.account?.name ?? '' };
}

async function main() {
  if (!SCHLUESSEL) {
    console.error('FORTNITE_API_KEY fehlt in .env.local - ohne den geht es nicht.');
    process.exit(1);
  }

  const profile = await lies('spieler-profile.json');
  const verzeichnis = await lies('spieler-namen.json');

  const ziele = Object.entries(profile).filter(([, p]) => p.id);
  console.log(`${ziele.length} Profile mit Epic-Konto werden nachgesehen.`);

  let geaendert = 0; let privat = 0; let fehler = 0; let neueSchreibweise = 0;

  for (const [, p] of ziele) {
    const { stand, name } = await nameZu(p.id);
    if (stand === 'privat') { privat += 1; continue; }
    if (stand !== 'ok' || !name) { fehler += 1; continue; }

    const bekannt = verzeichnis[p.id]?.namen ?? [];
    const gepflegt = p.anzeige || p.name || '';

    // Neu ist, was weder gepflegt noch im Verzeichnis schon steht.
    const istNeu = !gleich(name, gepflegt)
      && !bekannt.some((n) => gleich(n, name));

    if (istNeu) {
      geaendert += 1;
      console.log(`  ${gepflegt.padEnd(24)} heisst jetzt  ${name}`);
      if (SCHREIBEN) {
        verzeichnis[p.id] ??= { namen: [], haupt: gepflegt };
        verzeichnis[p.id].namen = [...new Set([...bekannt, name])];
        neueSchreibweise += 1;
      }
    }
    // Ruecksicht auf das Kontingent: rund 180 Anfragen je Minute sind erlaubt.
    await new Promise((f) => setTimeout(f, 340));
  }

  console.log(`\n${geaendert} umbenannt, ${privat} mit privaten Werten, `
    + `${fehler} ohne Antwort.`);

  if (!SCHREIBEN) {
    console.log('Nichts geschrieben. Mit --schreiben die neuen Schreibweisen '
      + 'ins Namensverzeichnis aufnehmen (der Anzeigename bleibt unberuehrt).');
    return;
  }
  await fs.writeFile(path.join(ORT, 'spieler-namen.json'),
    JSON.stringify(verzeichnis, null, 2), 'utf8');
  console.log(`${neueSchreibweise} Schreibweisen in data/spieler-namen.json `
    + 'aufgenommen. Die gepflegten Anzeigenamen sind unveraendert.');
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
