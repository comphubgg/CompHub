/*
 * Der stuendliche Lauf meldet sich in #admin-alarm - aber nur, wenn etwas
 * nicht stimmt.
 *
 * Vierzig Laeufe hintereinander wurden an der Frist abgebrochen, die
 * Weltrangliste stand dreizehn Tage, und niemand hat es gesehen: jeder
 * Schritt lief unter "continue-on-error", und der Betreiber liest keine
 * GitHub-Protokolle. Deshalb prueft dieser Schritt am Ende eines Laufs,
 * was der Lauf geschafft hat, und schreibt nur bei einem Problem in den
 * Admin-Kanal. Ein stiller Lauf ist ein guter Lauf.
 *
 * Geprueft wird, was auf der Platte des Laufrechners liegt (der Lauf
 * schreibt alles dorthin, bevor es in die Ablage geht):
 *
 *   - Weltrangliste: aelter als zwei Tage
 *   - Cup-Katalog (Antwort catalog_…): aelter als drei Stunden
 *   - Startansicht (Antwort szene|ansicht=start): aelter als sechs Stunden
 *   - der Auftrag selbst: Status aus GitHub (LAUF_STATUS)
 *
 * Umgebung: DISCORD_BOT_TOKEN aus .env.local, LAUF_STATUS, LAUF_URL (vom
 * Workflow gesetzt). Kein process.exit: Node 24 unter Windows meldet sonst
 * nach einem fetch eine Assertion beim Beenden.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEN = process.env.COMPHUB_DATEN || path.join(PROJEKT, 'data');
const API = 'https://discord.com/api/v10';

function umgebung() {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim();
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
}
const U = umgebung();
const TOKEN = U.DISCORD_BOT_TOKEN || '';
const SERVER = U.DISCORD_SERVER_ID || '1529205620287344783';

const alter = (datei, feld) => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(DATEN, datei), 'utf8'));
    const t = feld ? j[feld] : (j.zeit ?? j.geholt ?? j.fetchedAt);
    return typeof t === 'number' ? (Date.now() - t) / 3_600_000 : null;
  } catch { return null; }
};
const stunden = (h) => (h === null ? 'fehlt' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);

const probleme = [];
const status = (U.LAUF_STATUS || '').toLowerCase();
if (status && status !== 'success') probleme.push(`Der Lauf endete mit "${status}".`);

const rangliste = alter('power-rankings/global.json', 'geholt');
if (rangliste === null || rangliste > 48) probleme.push(`Weltrangliste: Stand ${stunden(rangliste)} alt (Ziel: taeglich).`);

const antworten = path.join(DATEN, 'antworten');
const juengste = (muster) => {
  try {
    const zeiten = fs.readdirSync(antworten).filter((n) => muster.test(n))
      .map((n) => { try { return JSON.parse(fs.readFileSync(path.join(antworten, n), 'utf8')).zeit ?? 0; } catch { return 0; } });
    return zeiten.length ? (Date.now() - Math.max(...zeiten)) / 3_600_000 : null;
  } catch { return null; }
};
const katalog = juengste(/^catalog_/);
if (katalog === null || katalog > 3) probleme.push(`Cup-Katalog: Antwort ${stunden(katalog)} alt.`);
const start = juengste(/^szene_ansicht=start/);
if (start === null || start > 6) probleme.push(`Startansicht: Antwort ${stunden(start)} alt.`);

if (!probleme.length) { console.log('  Lauf in Ordnung - nichts gemeldet.'); process.exit(0); }
console.log('  Probleme:', probleme.join(' | '));
if (!TOKEN) { console.log('  Kein Bot-Token - nicht gemeldet.'); process.exit(0); }

const h = { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' };
const kanaele = await (await fetch(`${API}/guilds/${SERVER}/channels`, { headers: h })).json();
const kanal = Array.isArray(kanaele) ? kanaele.find((k) => k.type === 0 && k.name === 'admin-alarm') : null;
if (!kanal) { console.log('  Kanal #admin-alarm fehlt - nicht gemeldet.'); process.exit(0); }
await fetch(`${API}/channels/${kanal.id}/messages`, {
  method: 'POST', headers: h,
  body: JSON.stringify({
    embeds: [{
      title: 'ALERT · hourly run',
      description: probleme.map((p) => `- ${p}`).join('\n') + (U.LAUF_URL ? `\n\n[Log](${U.LAUF_URL})` : ''),
      color: 0xef4444,
      footer: { text: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' },
    }],
  }),
});
console.log('  In #admin-alarm gemeldet.');
