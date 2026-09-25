/*
 * #results: die ersten zehn jedes Finales, von selbst nach dem Ende.
 *
 * Laeuft im stuendlichen Lauf gegen dessen eigenen Server (wie
 * admin-zahlen-discord.mjs). Genommen werden die Finals der
 * Championship-Cups (FNCS, Performance Evaluation, Globals, Solos), die in
 * den letzten 36 Stunden zu Ende gingen und seit mindestens einer halben
 * Stunde vorbei sind - dann hat Epic die Wertung abgeschlossen.
 *
 * Ein Finale ist, was Epic so kennzeichnet oder "Final" heisst - und bei
 * der Performance Evaluation die letzte Runde eines Abends (Epic traegt
 * dort nichts ein, siehe fensterNamen in app/events/[id]/page.tsx).
 *
 * Ohne eigene Ablage: der Kanal ist das Gedaechtnis ("result:<windowId>"
 * im Fuss jeder Meldung).
 *
 * Aufruf (der Server muss laufen):
 *   node scripts/ergebnisse-discord.mjs http://localhost:3000 [--probe]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const SERVER = (process.argv.find((a) => a.startsWith('http')) || 'http://localhost:3000').replace(/\/+$/, '');
const PROBE = process.argv.includes('--probe');
const API = 'https://discord.com/api/v10';
const KANAL = 'results';
const FARBE = 0x0ea5e9;
const SEITE = 'https://www.thecomphub.com';

function umgebung() {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
}
const U = umgebung();
const TOKEN = U.DISCORD_BOT_TOKEN || '';
const SERVER_ID = U.DISCORD_SERVER_ID || '1529205620287344783';

async function ruf(weg, methode = 'GET', koerper) {
  const r = await fetch(`${API}${weg}`, {
    method: methode,
    headers: { Authorization: `Bot ${TOKEN}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
    ...(koerper ? { body: JSON.stringify(koerper) } : {}),
  });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

const holeJson = (weg, init) => fetch(`${SERVER}${weg}`, { cache: 'no-store', ...init })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null);

/** "Week 4 Finals", "Event 5 Finals", "Day 2" - aus Epics Fensterkennung. */
function tagName(windowId) {
  const w = String(windowId);
  let m = w.match(/Week(\d+)Final/i); if (m) return `Week ${m[1]} Finals`;
  m = w.match(/Event(\d+)Round\d+/i); if (m) return `Event ${m[1]} Finals`;
  m = w.match(/Day(\d+)/i); if (m) return `Day ${m[1]}`;
  if (/Final/i.test(w)) return 'Finals';
  return '';
}

/** Die Finals, die jetzt dran sind. */
function finals(katalog) {
  const jetzt = Date.now();
  const raus = [];
  for (const cup of katalog?.cups ?? []) {
    if (cup.art !== 'championship' && cup.art !== 'division') continue;
    for (const [region, fenster] of Object.entries(cup.regionen ?? {})) {
      // Performance Evaluation: die hoechste Runde je Abend ist das Finale.
      const hoechste = new Map();
      for (const f of fenster) {
        const m = String(f.windowId).match(/Event(\d+)Round(\d+)/i);
        if (m) hoechste.set(m[1], Math.max(hoechste.get(m[1]) ?? 0, +m[2]));
      }
      for (const f of fenster) {
        if (f.status !== 'vorbei' || !f.end) continue;
        if (f.end > jetzt - 30 * 60_000 || f.end < jetzt - 36 * 3_600_000) continue;
        if (String(f.eventId).startsWith('manuell_')) continue;
        const m = String(f.windowId).match(/Event(\d+)Round(\d+)/i);
        // Bei einem LAN (Globals) ist jeder Tag Teil des Finales.
        const finale = cup.global || f.istFinale || /final/i.test(f.windowId)
          || (m && +m[2] === hoechste.get(m[1]) && +m[2] > 1);
        if (finale) raus.push({ cup, region, f });
      }
    }
  }
  return raus;
}

async function main() {
  if (!TOKEN) { console.log('Kein Bot-Token.'); return; }
  const katalog = await holeJson('/api/cup-catalog');
  if (!katalog) { console.log('Cup-Katalog antwortet nicht - nichts gepostet.'); return; }
  const liste = finals(katalog);
  if (!liste.length) { console.log('Kein Finale in den letzten 36 Stunden.'); return; }

  const kanaele = await ruf(`/guilds/${SERVER_ID}/channels`);
  const kanal = kanaele.find((k) => k.type === 0 && k.name === KANAL);
  if (!kanal) { console.log(`#${KANAL} fehlt - erst den Community-Aufbau laufen lassen.`); return; }
  const ich = await ruf('/users/@me');
  const schon = new Set((await ruf(`/channels/${kanal.id}/messages?limit=100`))
    .filter((m) => m.author?.id === ich.id)
    .map((m) => m.embeds?.[0]?.footer?.text ?? '')
    .filter((t) => t.startsWith('result:'))
    .map((t) => t.slice('result:'.length)));

  let gepostet = 0;
  for (const { cup, region, f } of liste) {
    if (schon.has(f.windowId)) continue;
    const lb = await holeJson(`/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}&window=${encodeURIComponent(f.windowId)}`);
    const zehn = (lb?.entries ?? []).slice(0, 10);
    if (zehn.length < 3) { console.log('Noch keine Wertung:', f.windowId); continue; }

    const ids = zehn.flatMap((e) => (e.players ?? []).map((p) => p.id));
    const echt = (await holeJson('/api/echte-namen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, event: f.eventId }),
    }))?.namen ?? {};
    const zeilen = zehn.map((e) => {
      const namen = (e.players ?? []).map((p) => echt[p.id] || p.name).join(' + ');
      const teile = [`${e.points} pts`];
      if (e.wins) teile.push(`${e.wins} ${e.wins === 1 ? 'win' : 'wins'}`);
      teile.push(`${e.elims} elims`);
      return `\`${String(e.rank).padStart(2)}.\` **${namen}** · ${teile.join(' · ')}`;
    });
    const titel = `🏆 ${cup.titel}${tagName(f.windowId) ? ` · ${tagName(f.windowId)}` : ''} · ${region}`;
    const koerper = {
      embeds: [{
        title: titel.slice(0, 256),
        url: `${SEITE}/events/${encodeURIComponent(cup.id)}`,
        description: `${zeilen.join('\n')}\n\nFull standings on [CompHub](${SEITE}/events/${encodeURIComponent(cup.id)})`.slice(0, 4000),
        color: FARBE,
        footer: { text: `result:${f.windowId}` },
        timestamp: new Date(f.end).toISOString(),
      }],
    };
    console.log(PROBE ? '[probe]' : 'gepostet:', titel);
    if (PROBE) { console.log(zeilen.join('\n')); continue; }
    await ruf(`/channels/${kanal.id}/messages`, 'POST', koerper);
    gepostet += 1;
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`${liste.length} Finals geprueft, ${gepostet} neu gepostet.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
