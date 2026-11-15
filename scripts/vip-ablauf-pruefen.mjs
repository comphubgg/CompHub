#!/usr/bin/env node
/*
 * Prueft die Laufzeit der VIP-Zugangsschluessel (lib/vipZugaenge, lib/discord vipAblaufLauf) - ohne echtes Discord und ohne echte Ablage.
 *
 *   node scripts/vip-ablauf-pruefen.mjs
 *
 * Laeuft in einem leeren Ordner unter dem Systemtemp (DATEN_ORT = <dort>/data); Discord ist ein nachgebautes fetch, das jeden Aufruf
 * mitschreibt. Geprueft wird:
 *   1. Schluessel mit Frist gilt davor (rechteVon, zugangNach) und danach nicht mehr.
 *   2. Der Lauf loescht Kanal und Zugang eines abgelaufenen Schluessels genau einmal - ein zweiter Lauf tut nichts mehr.
 *   3. Schluessel ohne Frist bleiben unangetastet (kein Loeschen, kein Bearbeiten ihrer Nachricht).
 *   4. Scheitert das Loeschen des Kanals, bleibt der Zugang fuer den naechsten Lauf stehen (gilt aber nicht mehr).
 *   5. Erinnerung 3 Tage vorher genau einmal; Schluesselnachricht zeigt <t:UNIX:R> und <t:UNIX:f>.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from 'jiti';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORT = fs.mkdtempSync(path.join(os.tmpdir(), 'vip-ablauf-'));
fs.mkdirSync(path.join(ORT, 'data'), { recursive: true });
process.chdir(ORT);
process.env.DISCORD_BOT_TOKEN = 'test-token';
process.env.DISCORD_SERVER_ID = 'S1';
delete process.env.COMPHUB_ABLAGE;
delete process.env.DISCORD_PUBLIC_KEY;

const TAG = 86_400_000;
const jetzt = Date.now();

/* ------------------------------------------------ Discord nachgebaut */
const aufrufe = [];
const kanaele = new Map([['K-alt', 'abgelaufen-key'], ['K-ohne', 'ohnefrist-key'], ['K-bald', 'bald-key'], ['K-fest', 'festkanal-key'], ['ALARM', 'admin-alarm']]);
let kanalLoeschenScheitert = new Set();
let naechsteId = 1000;
globalThis.fetch = async (url, init = {}) => {
  const weg = String(url).replace('https://discord.com/api/v10', '');
  const art = init.method ?? 'GET';
  const koerper = init.body ? JSON.parse(init.body) : undefined;
  aufrufe.push({ art, weg, koerper });
  const antwort = (status, j) => new Response(status === 204 ? null : JSON.stringify(j ?? {}), { status, headers: { 'content-type': 'application/json' } });
  let m;
  if (art === 'GET' && weg === '/guilds/S1/channels') return antwort(200, [...kanaele].map(([id, name]) => ({ id, name, type: 0 })));
  if (art === 'GET' && weg === '/guilds/S1/roles') return antwort(200, [{ id: 'R-alt', name: 'abgelaufen' }, { id: 'R-ohne', name: 'ohnefrist' }]);
  if (art === 'DELETE' && (m = weg.match(/^\/channels\/([^/]+)$/))) {
    if (kanalLoeschenScheitert.has(m[1])) return antwort(500, { message: 'kaputt' });
    if (!kanaele.has(m[1])) return antwort(404, { message: 'Unknown Channel' });
    kanaele.delete(m[1]);
    return antwort(204);
  }
  if (art === 'DELETE') return antwort(204);
  if (art === 'POST' && weg === '/users/@me/channels') return antwort(200, { id: 'DM' });
  if (art === 'POST' && /\/messages$/.test(weg)) return antwort(200, { id: `M${naechsteId++}` });
  if (art === 'PATCH' && /\/messages\//.test(weg)) return antwort(200, { id: weg.split('/').pop() });
  if (art === 'GET' && /\/messages/.test(weg)) return antwort(200, []);
  return antwort(200, {});
};

/* ------------------------------------------------ Ausgangslage */
const daten = path.join(ORT, 'data');
const schreibeUsers = (users) => fs.writeFileSync(path.join(daten, 'vip-users.json'), JSON.stringify({ users }, null, 2));
const liesUsers = () => JSON.parse(fs.readFileSync(path.join(daten, 'vip-users.json'), 'utf8')).users;
const liesKanaele = () => JSON.parse(fs.readFileSync(path.join(daten, 'discord-kanaele.json'), 'utf8'));
schreibeUsers([
  { username: 'abgelaufen', accessKey: 'KEY-A', status: 'active', createdAt: new Date(jetzt - 40 * TAG).toISOString(), vipBis: jetzt - 60_000, fristLoescht: true },
  { username: 'ohnefrist', accessKey: 'KEY-B', status: 'active', createdAt: new Date(jetzt - 400 * TAG).toISOString() },
  { username: 'bald', accessKey: 'KEY-C', status: 'active', createdAt: new Date(jetzt - 28 * TAG).toISOString(), vipBis: jetzt + 2 * TAG, fristLoescht: true, discordId: '123456789012345678' },
  { username: 'festkanal', accessKey: 'KEY-D', status: 'active', createdAt: new Date(jetzt - 5 * TAG).toISOString(), vipBis: jetzt - 1000, fristLoescht: true },
]);
fs.writeFileSync(path.join(daten, 'discord-kanaele.json'), JSON.stringify({
  abgelaufen: { kanal: 'K-alt', nachricht: 'M1' },
  ohnefrist: { kanal: 'K-ohne', nachricht: 'M2' },
  bald: { kanal: 'K-bald', nachricht: 'M3' },
  festkanal: { kanal: 'K-fest', nachricht: 'M4' },
}));

const jiti = createJiti(import.meta.url, { alias: { '@': WURZEL }, interopDefault: true });
const vz = await jiti.import(path.join(WURZEL, 'lib/vipZugaenge.ts'));
const dc = await jiti.import(path.join(WURZEL, 'lib/discord.ts'));

let fehler = 0;
const pruefe = (bedingung, text) => { console.log(`${bedingung ? 'OK  ' : 'FEHL'} ${text}`); if (!bedingung) fehler += 1; };

/* ------------------------------------------------ 1. gilt davor, danach nicht */
{
  const z = { username: 'x', accessKey: 'k', status: 'active', createdAt: '', ...vz.fristFuer(30, jetzt) };
  pruefe(z.vipBis === jetzt + 30 * TAG && z.fristLoescht === true, 'fristFuer(30): vipBis = jetzt + 30 Tage, fristLoescht');
  pruefe(Object.keys(vz.fristFuer(0)).length === 0, 'fristFuer(0): keine Frist (unbegrenzt)');
  pruefe(vz.laufzeitAus(undefined) === 30 && vz.laufzeitAus(7) === 7 && vz.laufzeitAus(0) === 0 && vz.laufzeitAus(-1) === null, 'laufzeitAus: Vorgabe 30, 7, 0, Unsinn abgelehnt');
  pruefe(!vz.zugangAbgelaufen(z, jetzt + 30 * TAG - 1) && vz.rechteVon(z).gueltig, 'Schluessel mit Frist: 1 ms vor Ablauf gueltig');
  pruefe(vz.zugangAbgelaufen(z, jetzt + 30 * TAG), 'Schluessel mit Frist: zum Ablauf abgelaufen');
  const alt = { ...z, vipBis: jetzt - 1 };
  pruefe(vz.rechteVon(alt).gueltig === false, 'rechteVon: abgelaufener Schluessel ungueltig (keine Rechte)');
  pruefe((await vz.zugangNach('abgelaufen')) === null, 'zugangNach: abgelaufener Schluessel gilt als nicht vorhanden (jeder Anmeldeweg)');
  pruefe((await vz.zugangNach('ohnefrist'))?.username === 'ohnefrist', 'zugangNach: Schluessel ohne Frist gilt weiter');
  pruefe(vz.rechteVon(await vz.zugangNach('ohnefrist')).gueltig, 'rechteVon: Schluessel ohne Frist gueltig');
  pruefe((await vz.wechsleSchluessel('abgelaufen', { ausDiscord: true })).grund === 'abgelaufen', 'wechsleSchluessel: abgelaufener bekommt keinen neuen Schluessel');
  const kontoFrist = { ...z, vipBis: jetzt - 1, fristLoescht: undefined };
  pruefe(vz.rechteVon(kontoFrist).gueltig && !vz.rechteVon(kontoFrist).vip, 'Frist ohne fristLoescht (Kontenseite): nimmt nur VIP, Schluessel bleibt (wie bisher)');
}

/* ------------------------------------------------ 5a. Inhalt der Schluesselnachricht */
{
  const bis = Date.UTC(2026, 11, 15, 12, 0, 0);
  const text = dc.schluesselInhalt('GEHEIM', 'name', bis);
  pruefe(text.includes(`<t:${bis / 1000}:R>`) && text.includes(`<t:${bis / 1000}:f>`), 'Schluesselnachricht zeigt <t:UNIX:R> und <t:UNIX:f>');
  pruefe(dc.schluesselInhalt('GEHEIM', 'name', 0).includes('No expiry'), 'Schluesselnachricht ohne Frist: "No expiry"');
}

/* ------------------------------------------------ 2.-5. Der Lauf */
kanalLoeschenScheitert = new Set(['K-fest']);
aufrufe.length = 0;
const lauf1 = await dc.vipAblaufLauf();
console.log('Lauf 1:', JSON.stringify(lauf1));
const kanalDeletes = (id) => aufrufe.filter((a) => a.art === 'DELETE' && a.weg === `/channels/${id}`).length;
pruefe(lauf1.geloescht.join() === 'abgelaufen', 'Lauf 1: abgelaufener Zugang entfernt');
pruefe(kanalDeletes('K-alt') === 1 && !kanaele.has('K-alt'), 'Lauf 1: privater Kanal mit dem Schluessel genau einmal geloescht');
pruefe(!liesUsers().some((u) => u.username === 'abgelaufen'), 'Lauf 1: Zugangseintrag geloescht');
pruefe(!('abgelaufen' in liesKanaele()), 'Lauf 1: Kanal-Zuordnung geloescht');
pruefe(liesUsers().some((u) => u.username === 'festkanal') && lauf1.offen.some((o) => o.name === 'festkanal'), 'Lauf 1: Kanal liess sich nicht loeschen -> Zugang bleibt fuer den naechsten Lauf');
pruefe((await vz.zugangNach('festkanal')) === null, 'Lauf 1: ... gilt dabei aber schon nicht mehr');
pruefe(liesUsers().find((u) => u.username === 'ohnefrist')?.accessKey === 'KEY-B', 'Ohne Frist: Zugang unveraendert');
pruefe(!aufrufe.some((a) => a.weg.includes('K-ohne')), 'Ohne Frist: kein einziger Discord-Aufruf an seinen Kanal (weder Loeschen noch Bearbeiten)');
pruefe(lauf1.erinnert.join() === 'bald', 'Lauf 1: Erinnerung 3 Tage vorher an "bald"');
const erinnerung = aufrufe.find((a) => a.art === 'POST' && a.weg === '/channels/K-bald/messages');
pruefe(Boolean(erinnerung?.koerper?.content?.match(/<t:\d+:R>.*<t:\d+:f>/)), 'Erinnerung mit <t:R> und <t:f>, Person erwaehnt');
pruefe(lauf1.nachgezogen.includes('bald'), 'Lauf 1: Schluesselnachricht von "bald" bekommt die Frist (PATCH, alter Schluessel ohne Anzeige)');
const patch = aufrufe.find((a) => a.art === 'PATCH' && a.weg === '/channels/K-bald/messages/M3');
pruefe(Boolean(patch?.koerper?.content?.includes(`<t:${Math.floor((jetzt + 2 * TAG) / 1000)}:R>`)), 'PATCH-Inhalt traegt den Countdown');
const alarm = aufrufe.find((a) => a.art === 'POST' && a.weg === '/channels/ALARM/messages');
pruefe(Boolean(alarm?.koerper?.embeds?.[0]?.description?.includes('abgelaufen')), 'Alarmkanal: Meldung, was entfernt wurde');
pruefe(!JSON.stringify(alarm?.koerper ?? {}).includes('KEY-'), 'Alarmkanal: kein Schluesselwert in der Meldung');
pruefe(Boolean(alarm?.koerper?.embeds?.[0]?.description?.match(/bald \(<#K-bald>\): <t:\d+:f>/)), 'Alarmkanal: wo der Countdown nachgetragen wurde, mit Kanal und Frist');

kanalLoeschenScheitert = new Set();
aufrufe.length = 0;
const lauf2 = await dc.vipAblaufLauf();
console.log('Lauf 2:', JSON.stringify(lauf2));
pruefe(kanalDeletes('K-alt') === 0, 'Lauf 2: bereits geloeschter Kanal wird nicht noch einmal angefasst');
pruefe(lauf2.geloescht.join() === 'festkanal' && kanalDeletes('K-fest') === 1, 'Lauf 2: der beim ersten Mal gescheiterte wird jetzt entfernt');
pruefe(lauf2.erinnert.length === 0, 'Lauf 2: keine zweite Erinnerung');
pruefe(lauf2.nachgezogen.length === 0, 'Lauf 2: nichts mehr nachzuziehen');

aufrufe.length = 0;
const lauf3 = await dc.vipAblaufLauf();
pruefe(lauf3.geloescht.length === 0 && lauf3.offen.length === 0 && !aufrufe.some((a) => a.art === 'DELETE'), 'Lauf 3: nichts mehr zu tun (idempotent)');
pruefe(liesUsers().map((u) => u.username).sort().join() === 'bald,ohnefrist', 'Am Ende: nur "bald" (laeuft noch) und "ohnefrist" stehen');

delete process.env.DISCORD_BOT_TOKEN;
const ohne = await dc.vipAblaufLauf();
pruefe(ohne.uebersprungen === 'kein-token', 'Ohne Bot-Token: Lauf loescht nichts (Schluessel gilt trotzdem nicht mehr)');

fs.rmSync(ORT, { recursive: true, force: true });
console.log(fehler ? `\n${fehler} Pruefung(en) fehlgeschlagen.` : '\nAlle Pruefungen bestanden.');
process.exit(fehler ? 1 : 0);
