/*
 * Die Zahlen des Tages nach #admin-zahlen - eine Nachricht je Tag, die der
 * stuendliche Lauf fortschreibt.
 *
 * Der Betreiber: "#admin-zahlen, z. B. wie viele Replays hochgeladen wurden,
 * nur heute, und wie viel es jetzt insgesamt hat, plus neue Earnings an
 * spezielle Spieler." Die Zahlen rechnet die eigene Schnittstelle
 * (/api/tageszahlen) dort, wo die Dateien liegen; dieses Skript holt sie
 * am laufenden Server des Laufs und schreibt sie in den Kanal. Je Tag
 * (UTC) entsteht eine Nachricht, jeder weitere Lauf desselben Tages
 * bearbeitet sie - so steht im Kanal ein Eintrag je Tag und nicht
 * vierundzwanzig.
 *
 * Aufruf (der Server muss laufen):
 *   node scripts/admin-zahlen-discord.mjs http://localhost:3000
 *
 * Merker: data/admin-zahlen.json (Tag -> Nachrichten-Id). Der Bot-Token
 * kommt aus .env.local (DISCORD_BOT_TOKEN). Kein process.exit: Node 24
 * unter Windows meldet sonst nach einem fetch eine Assertion beim Beenden.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEN = process.env.COMPHUB_DATEN || path.join(PROJEKT, 'data');
const MERKER = path.join(DATEN, 'admin-zahlen.json');
const SERVER = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const API = 'https://discord.com/api/v10';
const KANAL = 'admin-zahlen';
const FARBE = 0x0ea5e9;

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

/** Den Kanal finden - oder anlegen, mit denselben Rechten wie die anderen Admin-Kanaele. */
async function kanalFinden() {
  const kanaele = await ruf(`/guilds/${SERVER_ID}/channels`);
  const da = kanaele.find((k) => k.type === 0 && k.name.toLowerCase() === KANAL);
  if (da) return da.id;
  const rollen = await ruf(`/guilds/${SERVER_ID}/roles`);
  const admin = rollen.find((r) => (BigInt(r.permissions) & 8n) === 8n && !r.managed)?.id ?? null;
  const ich = (await ruf('/users/@me')).id;
  let kategorie = kanaele.find((k) => k.type === 4 && k.name.toLowerCase() === 'admin')?.id ?? null;
  if (!kategorie) kategorie = (await ruf(`/guilds/${SERVER_ID}/channels`, 'POST', { name: 'Admin', type: 4 })).id;
  const NICHT_SCHREIBEN = String(2048 + 2 ** 35 + 2 ** 36 + 2 ** 38);
  const regeln = [{ id: SERVER_ID, type: 0, allow: '0', deny: String(1024 + Number(NICHT_SCHREIBEN)) }, { id: ich, type: 1, allow: '76800', deny: '0' }];
  if (admin) regeln.push({ id: admin, type: 0, allow: '76800', deny: '0' });
  const neu = await ruf(`/guilds/${SERVER_ID}/channels`, 'POST', {
    name: KANAL, type: 0, parent_id: kategorie, permission_overwrites: regeln,
    topic: 'Numbers of the day - replays, match days, prize money, visitors; one message per day',
  });
  console.log(`  Kanal #${KANAL} angelegt.`);
  return neu.id;
}

const zahl = (n) => Number(n ?? 0).toLocaleString('en-US');
const geld = (n) => `${zahl(Math.round(n))} $`;

/*
 * Die Cups des Tages - aus dem Katalog der Seite. Der Betreiber (25.9.2026):
 * "Heute gibt es einen Cup. Das soll ja dann angezeigt werden, und
 * sozusagen, was fuer ein Cup, aufgelistet." Je Cup Name, Regionen und
 * Zeit (UTC) des ersten Fensters heute.
 */
async function cupsHeute(tag) {
  try {
    const r = await fetch(`${SERVER}/api/cup-catalog?modus=aktuell`, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return null;
    const j = await r.json();
    const raus = [];
    for (const c of j.cups ?? []) {
      const heute = Object.values(c.regionen ?? {}).flat()
        .filter((f) => new Date(f.begin).toISOString().slice(0, 10) === tag);
      if (!heute.length) continue;
      const regionen = [...new Set(heute.map((f) => f.region))];
      const beginn = Math.min(...heute.map((f) => f.begin));
      raus.push({ titel: c.titel || c.id, regionen, beginn });
    }
    return raus.sort((a, b) => a.beginn - b.beginn);
  } catch { return null; }
}

function einbettung(z) {
  const r = z.replays ?? {};
  const s = z.spieltage ?? {};
  const v = z.verdienst;
  const b = z.besuche ?? {};
  const felder = [
    {
      name: 'Replays analysed',
      value: `**${zahl(r.heute)}** today in ${zahl(r.fensterHeute)} match days · **${zahl(r.gesamt)}** in total`
        + (r.wartend ? `\n${zahl(r.wartend)} waiting` : '')
        + (r.fehlgeschlagen ? ` · ${zahl(r.fehlgeschlagen)} failed` : '')
        + (r.nichtVerfuegbar ? ` · ${zahl(r.nichtVerfuegbar)} not available at Epic` : ''),
      inline: false,
    },
    {
      name: 'Cups today',
      value: z.cupsHeute === null || z.cupsHeute === undefined
        ? 'The cup catalog did not answer.'
        : z.cupsHeute.length
          ? z.cupsHeute.slice(0, 12).map((c) => `**${c.titel}** · ${c.regionen.join(', ')} · from ${new Date(c.beginn).toISOString().slice(11, 16)} UTC`).join('\n')
          : 'No cup today.',
      inline: false,
    },
    {
      name: 'Match days (Epic leaderboards)',
      value: `**${zahl(s.heute)}** fetched today · **${zahl(s.gesamt)}** in total · scene archive ${zahl(z.szene?.spieltage)}`
        + (s.heuteNamen?.length ? `\n${s.heuteNamen.slice(0, 8).join(', ')}${s.heuteNamen.length > 8 ? ' …' : ''}` : ''),
      inline: false,
    },
  ];
  if (v) {
    const zeilen = (v.spieler ?? []).slice(0, 10).map((p, i) => {
      const f = p.fenster?.[0];
      const wo = f ? ` · ${f.titel || f.windowId} ${f.region} #${f.platz}${p.fenster.length > 1 ? ` +${p.fenster.length - 1}` : ''}` : '';
      return `${i + 1}. **${p.name}** ${geld(p.betrag)}${wo}`;
    });
    felder.push({
      name: 'Prize money today',
      value: v.spieltage
        ? `**${geld(v.summe)}** to ${zahl(v.konten)} accounts · ${zahl(v.mitTabelle)} of ${zahl(v.spieltage)} match days with a payout table`
          + (zeilen.length ? `\n${zeilen.join('\n')}` : '')
        : 'No finished match day yet today.',
      inline: false,
    });
  }
  const h = b.heute; const g = b.gestern;
  felder.push({
    name: 'Site',
    value: `Visitors today **${zahl(h?.besucher)}** (${zahl(h?.aufrufe)} views, ${zahl(h?.neu)} new)`
      + (g ? ` · yesterday ${zahl(g.besucher)} (${zahl(g.aufrufe)} views)` : '')
      + `\nAccounts **${zahl(z.konten?.gesamt)}** (+${zahl(z.konten?.neuHeute)} today, ${zahl(z.konten?.aktivHeute)} active) · VIP keys **${zahl(z.vip?.gesamt)}** (+${zahl(z.vip?.neuHeute)} today)`,
    inline: false,
  });
  return {
    title: `Numbers · ${z.tag}`,
    color: FARBE,
    fields: felder.map((f) => ({ ...f, value: f.value.slice(0, 1024) })),
    footer: { text: `updated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC` },
  };
}

async function main() {
  if (!TOKEN) { console.log('DISCORD_BOT_TOKEN fehlt - nichts geschrieben.'); return; }
  let z;
  try {
    const r = await fetch(`${SERVER}/api/tageszahlen`, { signal: AbortSignal.timeout(90_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    z = await r.json();
  } catch (e) {
    console.log(`Zahlen nicht erreichbar (${SERVER}): ${e.message}`);
    return;
  }
  /*
   * Keine Nullen als Tageszahlen ausgeben, wenn in Wahrheit die Daten
   * fehlen. Am 25.9.2026 sah der Lauf seinen Datenordner nicht und meldete
   * "Replays heute 0, Spieltage heute 0" - der Betreiber las daraus, dass
   * nichts mehr ausgewertet wird.
   */
  if (!Number(z.spieltage?.gesamt) && !Number(z.replays?.gesamt)) {
    console.log('  Keine Spieltage und keine Replays im Datenordner - das ist ein Fehler des Laufs, keine Tageszahl. Nichts gemeldet.');
    return;
  }
  z.cupsHeute = await cupsHeute(z.tag);
  let merker = {};
  try { merker = JSON.parse(fs.readFileSync(MERKER, 'utf8')); } catch { /* neu */ }

  const kanal = await kanalFinden();
  const inhalt = { embeds: [einbettung(z)] };
  /*
   * Ohne Merker im Kanal nachsehen: der Laufrechner und der Rechner des
   * Betreibers haben je einen eigenen Datenordner, und die Nachricht des
   * Tages soll trotzdem nur einmal entstehen.
   */
  if (!merker[z.tag]) {
    try {
      const letzte = await ruf(`/channels/${kanal}/messages?limit=20`);
      const ich = (await ruf('/users/@me')).id;
      const da = letzte.find((m) => m.author?.id === ich && m.embeds?.[0]?.title === `Numbers · ${z.tag}`);
      if (da) merker[z.tag] = da.id;
    } catch { /* dann eine neue */ }
  }
  let ok = false;
  if (merker[z.tag]) {
    try { await ruf(`/channels/${kanal}/messages/${merker[z.tag]}`, 'PATCH', inhalt); ok = true; }
    catch { ok = false; }
  }
  if (!ok) {
    const neu = await ruf(`/channels/${kanal}/messages`, 'POST', inhalt);
    merker[z.tag] = neu.id;
    // Nur die letzten Tage merken - die Datei soll klein bleiben.
    for (const k of Object.keys(merker).sort().slice(0, -14)) delete merker[k];
    fs.mkdirSync(path.dirname(MERKER), { recursive: true });
    fs.writeFileSync(MERKER, JSON.stringify(merker, null, 2));
  }
  console.log(`  #${KANAL}: ${z.tag} ${ok ? 'fortgeschrieben' : 'angelegt'} - Replays heute ${z.replays?.heute}, Spieltage heute ${z.spieltage?.heute}, Preisgeld ${Math.round(z.verdienst?.summe ?? 0)} $`);
}

main().catch((e) => console.log(`Fehlgeschlagen: ${e.message}`));
