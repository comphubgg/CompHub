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

/*
 * Eine Nachricht je Problem, nicht je Lauf (Betreiber, 13.10.2026: "stuendlich Lauf ... Antwort 15 alt - was bedeutet das?").
 * Der Lauf rechnet jede Stunde nach; stand die Startansicht schon 15 Stunden still, stuende dieselbe Meldung vierundzwanzigmal im
 * Kanal. Darum bekommt das Problem einen Schluessel (ohne Zahlen). Steht dieselbe Meldung schon im Kanal, wird sie nur aktualisiert
 * - ein Bearbeiten laeutet nicht. Neu gemeldet wird nur, was neu ist. Ist wieder alles in Ordnung, wird die offene Meldung gruen
 * und als behoben markiert.
 */
const KENNUNG = 'comphub-lauf-alarm';
const schluessel = probleme.map((p) => p.replace(/"[^"]*"/g, '"?"').replace(/[0-9]+([.,][0-9]+)? ?(min|h)\b/g, 'N')).sort().join('|');
const h = { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' };
const holen = async (url, opt) => { try { const r = await fetch(url, { headers: h, ...opt }); return r.ok ? await r.json() : null; } catch { return null; } };
const jetzt = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const text = (liste) => liste.map((p) => `- ${p}`).join('\n') + (U.LAUF_URL ? `\n\n[Protokoll](${U.LAUF_URL})` : '');

if (!probleme.length) console.log('  Lauf in Ordnung - nichts neu gemeldet.');
else console.log('  Probleme:', probleme.join(' | '));

if (!TOKEN) console.log('  Kein Bot-Token - nicht gemeldet.');
else {
  const kanaele = await holen(`${API}/guilds/${SERVER}/channels`);
  const kanal = Array.isArray(kanaele) ? kanaele.find((k) => k.type === 0 && k.name === 'admin-alarm') : null;
  if (!kanal) console.log('  Kanal #admin-alarm fehlt - nicht gemeldet.');
  else {
    // Die letzte Meldung dieses Laufs: unsere eigene, mit der Kennung im Fuss.
    const letzte = await holen(`${API}/channels/${kanal.id}/messages?limit=30`);
    const offen = Array.isArray(letzte)
      ? letzte.find((m) => (m.embeds ?? []).some((e) => String(e.footer?.text ?? '').includes(`${KENNUNG}:`)))
      : null;
    const offenSchluessel = offen ? String(offen.embeds[0].footer.text).split(`${KENNUNG}:`)[1]?.split(' · ')[0]?.trim() : null;
    const bearbeite = (m, embed) => holen(`${API}/channels/${kanal.id}/messages/${m.id}`, { method: 'PATCH', body: JSON.stringify({ embeds: [embed] }) });

    if (!probleme.length) {
      if (offen && offenSchluessel && offenSchluessel !== 'behoben') {
        await bearbeite(offen, {
          title: 'BEHOBEN · stündlicher Lauf', color: 0x22c55e,
          description: `${offen.embeds[0].description}\n\nSeit ${jetzt} wieder in Ordnung.`,
          footer: { text: `${KENNUNG}:behoben · ${jetzt}` },
        });
        console.log('  Offene Meldung als behoben markiert.');
      }
    } else if (offen && offenSchluessel === schluessel) {
      await bearbeite(offen, {
        title: 'ALARM · stündlicher Lauf', color: 0xef4444,
        description: `${text(probleme)}\n\nBesteht weiter - diese Meldung wird nur aktualisiert, nicht neu gesendet.`,
        footer: { text: `${KENNUNG}:${schluessel} · ${jetzt}` },
      });
      console.log('  Dieselbe Meldung steht schon im Kanal - aktualisiert, nicht neu gesendet.');
    } else {
      await holen(`${API}/channels/${kanal.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          embeds: [{
            title: 'ALARM · stündlicher Lauf', color: 0xef4444, description: text(probleme),
            footer: { text: `${KENNUNG}:${schluessel} · ${jetzt}` },
          }],
        }),
      });
      console.log('  Neues Problem in #admin-alarm gemeldet.');
    }
  }
}
