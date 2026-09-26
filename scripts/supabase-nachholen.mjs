/*
 * Aus Comphub 2 nachholen, was im Umzug nach Comphub 4 fehlte.
 *
 * Am 25.9.2026 um 22:30 UTC blieb Comphub 2 stehen. Der Umzug nach
 * Comphub 4 (26.9., ablauf "Supabase-Umzug") kam aus dem Zwischenspeicher des
 * stuendlichen Laufs, Stand 21:39 UTC - und nur mit den Dateien, die dieser
 * Lauf sichert. Was die Seite sonst noch schreibt (eigene Globals-Prognosen
 * der VIPs, Tierlisten je Konto, Schloesser der Statistik, ...) und was
 * zwischen 21:39 und 22:30 geaendert wurde, liegt nur in Comphub 2.
 *
 * Antwortet Comphub 2 wieder, holt dieses Skript genau das nach - Zeile fuer
 * Zeile aus der Tabelle:
 *
 *   - fehlt der Name in Comphub 4                  -> uebernehmen
 *   - in Comphub 2 nach 21:39 geaendert, und in
 *     Comphub 4 seit dem Umzug unberuehrt           -> uebernehmen
 *   - in beiden seither geaendert                   -> nicht anfassen, melden
 *   - sonst                                          -> nichts zu tun
 *
 * Was nach dem Umzug auf der Seite geschrieben wurde, wird also nie
 * ueberschrieben. Konten und VIP-Zugaenge bleiben draussen (eigenes
 * Anmelde-Projekt). Jede uebernommene Zeile wird zurueckgelesen und
 * verglichen.
 *
 * Aufruf:  node scripts/supabase-nachholen.mjs [--probe]
 * Braucht in .env.local: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (Comphub 4)
 * und SUPABASE_C2_URL/SUPABASE_C2_SERVICE_ROLE_KEY (Comphub 2).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const PROBE = process.argv.includes('--probe');
const TABELLE = 'ablage';
/** Stand des Zwischenspeichers, aus dem Comphub 4 befuellt wurde. */
const SCHNAPPSCHUSS = Date.parse('2026-09-25T21:39:00Z');
/** Nach dem Umzug: was in Comphub 4 juenger ist, hat die Seite geschrieben. */
const UMZUG_ENDE = Date.parse('2026-09-26T06:04:00Z');
const AUSGENOMMEN = new Set(['konten.json', 'vip-users.json']);
/** Gerechnetes gehoert ans Release, nicht nach Supabase ("nur das Noetigste"). */
const GERECHNET = /^(antworten|power-rankings|epic-spieltage|platzierungen|szene-stats|szene-quelle|replays)\/|^(cup-archiv|epic-namen|verdienst-archiv|elims-archiv|preisgeld-tabellen|prognose-felder)\.json$/;

function umgebung() {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z0-9_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
}
const U = umgebung();
const kopf = (k) => (k.startsWith('sb_') ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` });
const ALT = { url: (U.SUPABASE_C2_URL || '').replace(/\/+$/, ''), kopf: kopf(U.SUPABASE_C2_SERVICE_ROLE_KEY || '') };
const NEU = { url: (U.SUPABASE_URL || '').replace(/\/+$/, ''), kopf: kopf(U.SUPABASE_SERVICE_ROLE_KEY || '') };

async function holeJson(p, weg, ms = 30_000) {
  const r = await fetch(`${p.url}/rest/v1/${weg}`, { headers: p.kopf, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/** Alle Namen mit Zeitpunkt, seitenweise. */
async function zeilen(p) {
  const raus = new Map();
  for (let ab = 0; ; ab += 1000) {
    const teil = await holeJson(p, `${TABELLE}?select=name,geaendert&order=name&limit=1000&offset=${ab}`);
    for (const z of teil) raus.set(z.name, Date.parse(z.geaendert));
    if (teil.length < 1000) break;
  }
  return raus;
}

async function main() {
  if (!ALT.url || !NEU.url) { console.log('Zugangsdaten fehlen.'); return; }
  let alt;
  try { alt = await zeilen(ALT); } catch (e) {
    console.log(`Comphub 2 antwortet nicht (${e.message}) - naechstes Mal.`);
    return;
  }
  const neu = await zeilen(NEU);

  const holen = []; const beidseitig = [];
  for (const [name, zeitAlt] of alt) {
    if (AUSGENOMMEN.has(name) || GERECHNET.test(name)) continue;
    const zeitNeu = neu.get(name);
    if (zeitNeu === undefined) { holen.push(name); continue; }
    if (zeitAlt > SCHNAPPSCHUSS) {
      if (zeitNeu < UMZUG_ENDE) holen.push(name);
      else beidseitig.push(name);
    }
  }
  console.log(`Comphub 2: ${alt.size} Zeilen, Comphub 4: ${neu.size}. Nachzuholen: ${holen.length}, in beiden geaendert: ${beidseitig.length}.`);
  for (const n of holen.slice(0, 60)) console.log(`  holen  ${n}`);
  for (const n of beidseitig) console.log(`  beide  ${n} (nicht angefasst)`);
  if (PROBE || !holen.length) return;

  let ok = 0; const schief = [];
  for (const name of holen) {
    try {
      const [z] = await holeJson(ALT, `${TABELLE}?name=eq.${encodeURIComponent(name)}&select=wert`, 60_000);
      if (!z) continue;
      const r = await fetch(`${NEU.url}/rest/v1/${TABELLE}`, {
        method: 'POST',
        headers: { ...NEU.kopf, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ name, wert: z.wert }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      const [zurueck] = await holeJson(NEU, `${TABELLE}?name=eq.${encodeURIComponent(name)}&select=wert`);
      if (zurueck?.wert !== z.wert) throw new Error('weicht nach dem Schreiben ab');
      ok += 1;
    } catch (e) { schief.push(`${name}: ${e.message}`); }
  }
  console.log(`Uebernommen und nachgeprueft: ${ok}, gescheitert: ${schief.length}`);
  for (const s of schief) console.log(`  - ${s}`);

  // Bericht nach #admin-log - einmal, wenn wirklich etwas kam.
  if (ok && U.DISCORD_BOT_TOKEN) {
    const API = 'https://discord.com/api/v10';
    const h = { Authorization: `Bot ${U.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' };
    const kanaele = await fetch(`${API}/guilds/${U.DISCORD_SERVER_ID || '1529205620287344783'}/channels`, { headers: h }).then((r) => r.json());
    const k = Array.isArray(kanaele) && kanaele.find((x) => x.type === 0 && x.name === 'admin-log');
    if (k) {
      await fetch(`${API}/channels/${k.id}/messages`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ embeds: [{
          title: 'DONE · Comphub 2 is back - missing data copied to Comphub 4', color: 0x0ea5e9,
          description: `${ok} files copied from Comphub 2 (missing in Comphub 4 or changed there after the backup), each read back and compared.`
            + (beidseitig.length ? `\nChanged in both, left untouched: ${beidseitig.join(', ')}` : '')
            + (schief.length ? `\nFailed: ${schief.length}` : ''),
          footer: { text: new Date().toISOString().slice(0, 10) },
        }] }),
      });
    }
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
