/*
 * Den Community-Discord neu ordnen - erst zeigen, dann (auf Wunsch) tun.
 *
 * Der Betreiber (15.11.2026) will den Server nach dem Vorbild eines Mitbewerbers: oben INFORMATION
 * (Willkommen, Ankuendigungen, Changelog, X-Posts), darunter COMMUNITY (Beitritte, Chat, Stats-Befehle,
 * Support- und Feedback-Forum). Alles Private - VIP-Bereich mit den Schluesselkanaelen, Admin, Manager,
 * Pro-Zugaenge, Tickets, Chats - bleibt, wie es ist.
 *
 *   node scripts/discord-umbau.mjs                     nur der Plan (liest, aendert nichts)
 *   node scripts/discord-umbau.mjs --anwenden          Plan ausfuehren (ohne Loeschen)
 *   node scripts/discord-umbau.mjs --anwenden --loeschen
 *                                                      dazu die Loesch-Kandidaten entfernen
 *   --emoji-namen   auch die Kanaele umbenennen, die der Code ueber ihren Namen sucht (#welcome,
 *                   #announcements, #updates, #news, #results, #live-now, Kategorie "Community").
 *                   NUR, wenn die Namenssuche im Code vorher tolerant gemacht wurde - sonst legen
 *                   lib/discord.ts und die Skripte beim naechsten Lauf Doppelte an (siehe unten).
 *   --ohne-willkommen  die Willkommensnachricht nicht anfassen
 *
 * Beliebig oft gangbar: gefunden wird ueber den "Kern" des Namens (ohne Emoji und Trennzeichen vorne -
 * "🏠-welcome" und "welcome" sind derselbe Kanal), angelegt wird nur, was fehlt, geaendert nur, was
 * abweicht. Ein zweiter Lauf direkt danach zeigt einen leeren Plan.
 *
 * Was nie geloescht wird: alles, was der Code kennt (Namen und Muster unten, aus lib/discord.ts,
 * lib/discordGilden.ts, lib/botFreunde.ts und scripts/*discord*.mjs), alles Private (@everyone darf
 * nicht sehen), Sprach- und Buehnenkanaele, die Kanaele, die Discord selbst braucht (Regeln,
 * Community-Updates, Systemkanal, AFK), und Kategorien, in denen noch etwas liegt.
 *
 * Bot-Token aus .env.local oder der Umgebung (DISCORD_BOT_TOKEN), Server DISCORD_SERVER_ID.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { FOREN, willkommen, WILLKOMMEN_MARKE, STATS_BEFEHLE } from '../lib/discordVorlagen.mjs';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const API = 'https://discord.com/api/v10';

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
const TOKEN = (U.DISCORD_BOT_TOKEN || '').trim();
const SERVER = U.DISCORD_SERVER_ID || '1529205620287344783';
/** Die Kategorie der VIP-Schluesselkanaele (lib/discord.ts KATEGORIE). */
const VIP_KATEGORIE = U.DISCORD_KATEGORIE_ID || '1529205953118081167';

const ANWENDEN = process.argv.includes('--anwenden');
const LOESCHEN = process.argv.includes('--loeschen');
const EMOJI = process.argv.includes('--emoji-namen');
const WILLKOMMEN = !process.argv.includes('--ohne-willkommen');

/* ================================================================ Was der Code kennt (Inventar) */

/** Kanaele, die der Code ueber den genauen Namen sucht - umbenennen bricht die Suche. */
const CODE_KANAELE = [
  // lib/discord.ts: Aushaenge (BEITRAEGE), Support, Tickets
  'welcome', 'vip-guide', 'manager-guide', 'support', 'transkriptionen', 'manager-support',
  // Updates, Zugang
  'updates', 'vip-updates', 'manager-updates', 'get-access', 'access-requests',
  // Community (COMMUNITY_KANAELE) - scripts/live-discord.mjs, ergebnisse-discord.mjs suchen genau so
  'announcements', 'news', 'live-now', 'results', 'vip-lounge', 'manager-chat',
  // Admin (ADMIN_KANAELE, Werkzeug, Pro, Skripte)
  'admin-log', 'admin-aufgaben', 'admin-alarm', 'admin-posts', 'admin-support', 'admin-joins',
  'admin-tools', 'admin-dms', 'pro-accounts', 'to-do-for-admin', 'claude-to-do', 'admin-zahlen',
  'admin-ideen', 'admin-bot-friends', 'comphub-dashboard',
];
/** Namensmuster fuer Kanaele, die der Code je Person anlegt. */
const CODE_MUSTER = [/-key$/, /-manager-keys$/, /-pro-key$/, /^m?ticket-/, /^chat-/, /^admin-/];
/** Kategorien, die der Code ueber den Namen sucht (kategorieFuer, Skripte). */
const CODE_KATEGORIEN = ['community', 'updates', 'access', 'support', 'admin', 'manager access keys',
  'pro access keys', 'chats', 'welcome', 'tickets'];
/** Fest hinterlegte Kanaele (lib/discord.ts BEKANNTE_KANAELE). */
const BEKANNTE_IDS = ['1529207545921540096', '1529207598593609861', '1529207652515844147',
  '1529207738809450619', '1529207809709965492', '1529207869075881994', '1529554751275143309'];
/** Rollen, auf die sich der Code verlaesst (Name, klein). Die Admin-Rolle wird ueber das Recht gefunden. */
const CODE_ROLLEN = ['vip streamer', 'vip', 'vip manager', 'pro', 'pro news'];

/* ===================================================================== Rechte (wie lib/discord) */

const B = (n) => 1n << BigInt(n);
const R = {
  VIEW: B(10), SEND: B(11), MANAGE_MSG: B(13), EMBED: B(14), ATTACH: B(15), HISTORY: B(16),
  REACT: B(6), MENTION_ALL: B(17), CMDS: B(31), MANAGE_THREADS: B(34), PUB_THREADS: B(35),
  PRIV_THREADS: B(36), SEND_THREADS: B(38), ADMIN: B(3), MANAGE_CHANNELS: B(4), MANAGE_GUILD: B(5),
  MANAGE_ROLES: B(28),
};
const LESEN = R.VIEW | R.HISTORY;
const NICHT_SCHREIBEN = R.SEND | R.PUB_THREADS | R.PRIV_THREADS | R.SEND_THREADS;
const VOLL = R.VIEW | R.SEND | R.MANAGE_MSG | R.HISTORY;
const CHAT = R.VIEW | R.HISTORY | R.SEND | R.EMBED | R.ATTACH | R.REACT;

/* ================================================================================= Das Ziel */

/*
 * code: der Code sucht den Kanal ueber den Namen (Name bleibt ohne --emoji-namen), legt ihn an und
 *       setzt seine Rechte selbst - der Umbau verschiebt und ordnet ihn nur.
 * (Seit 15.11.2026 schiebt "Server einrichten" vorhandene Kanaele nicht mehr in ihre alte Kategorie
 *  zurueck und stellt in #welcome dieselbe Willkommensnachricht - lib/discord.ts infoKanal, richteServerEin.)
 */
/** Die Beschreibung von #check-stats - die Befehle aus app/api/discord/interaktion/route.ts (oeffentlich). */
const STATS_THEMA = 'Commands only - type / to start. /stats player:<name> shows a player\'s latest results '
  + '(add cup: for a specific cup) · /cup name:<cup> shows the top 10 of a cup · /help lists everything. '
  + 'Full stats: thecomphub.com/statistics';

const ZIEL = [
  {
    schluessel: 'info', name: '📘 Information',
    kanaele: [
      { kern: 'welcome', code: true, emoji: '🏠-welcome' },
      { kern: 'announcements', code: true, emoji: '📢-announcements' },
      { kern: 'updates', aliase: ['comphub-updates'], code: true, emoji: '🛠️-comphub-updates' },
      { kern: 'social-posts', name: '🐦-social-posts', rechte: 'aushang', thema: 'Every post from @CompHub_gg on X - posted automatically' },
      { kern: 'vip-guide', code: true, optional: true },
      { kern: 'manager-guide', code: true, optional: true },
    ],
  },
  {
    schluessel: 'community', name: 'Community', emojiName: '🌐 Community',
    kanaele: [
      { kern: 'system-messages', name: '🔔-system-messages', rechte: 'aushang', thema: 'Who joins the server - posted by Discord' },
      { kern: 'general-chat', aliase: ['general', 'chat'], name: '💬-general-chat', rechte: 'chat', thema: 'Talk competitive Fortnite - English please' },
      { kern: 'check-stats', aliase: ['stats'], name: '📈-check-stats', rechte: 'befehle', thema: STATS_THEMA },
      { kern: 'get-support', name: '🆘-get-support', typ: 15, rechte: 'forum' },
      { kern: 'give-feedback', aliase: ['feedback'], name: '📝-give-feedback', typ: 15, rechte: 'forum' },
      { kern: 'news', code: true, emoji: '📰-news' },
      { kern: 'results', code: true, emoji: '🏆-results' },
      { kern: 'live-now', code: true, emoji: '📺-live-now' },
      { kern: 'vip-lounge', code: true, optional: true },
      { kern: 'manager-chat', code: true, optional: true },
    ],
  },
];

/* ================================================================================ Werkzeuge */

/** "🏠-welcome" -> "welcome", "📘 Information" -> "information". */
const kern = (s) => String(s ?? '').toLowerCase().replace(/^[^a-z0-9]+/, '').trim();
const istText = (t) => t === 0 || t === 5;
const wann = (id) => (id ? new Date(Number(BigInt(id) >> 22n) + 1420070400000).toISOString().slice(0, 10) : '-');
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function ruf(weg, methode = 'GET', koerper) {
  if (methode !== 'GET' && !ANWENDEN) throw new Error(`Planmodus: ${methode} ${weg} nicht erlaubt`);
  for (let versuch = 0; versuch < 6; versuch += 1) {
    const r = await fetch(`${API}${weg}`, {
      method: methode,
      headers: { Authorization: `Bot ${TOKEN}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}),
        'X-Audit-Log-Reason': 'CompHub server redesign (scripts/discord-umbau.mjs)' },
      ...(koerper ? { body: JSON.stringify(koerper) } : {}),
    });
    if (r.status === 429) {
      const j = await r.json().catch(() => ({}));
      await warte(Math.ceil((j.retry_after ?? 2) * 1000) + 250);
      continue;
    }
    if (r.status === 204) return {};
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  }
  throw new Error(`${methode} ${weg}: zu oft gedrosselt`);
}

/* ================================================================================ Bestand */

if (!TOKEN) { console.error('DISCORD_BOT_TOKEN fehlt (.env.local oder Umgebung).'); process.exit(1); }

const [gilde, kanaeleRoh, rollen, ich] = await Promise.all([
  ruf(`/guilds/${SERVER}`), ruf(`/guilds/${SERVER}/channels`), ruf(`/guilds/${SERVER}/roles`), ruf('/users/@me'),
]);
let kanaele = kanaeleRoh;
const mitglied = await ruf(`/guilds/${SERVER}/members/${ich.id}`).catch(() => null);

const rolleNach = new Map(rollen.filter((r) => !r.managed).map((r) => [r.name.toLowerCase(), r]));
const adminRolle = rollen.find((r) => !r.managed && (BigInt(r.permissions) & R.ADMIN) === R.ADMIN) ?? null;
const proRolle = rolleNach.get('pro') ?? null;
const proNewsRolle = rolleNach.get('pro news') ?? null;

/* Was der Bot darf - fehlt etwas, scheitert ein Schritt, und das soll vorher dastehen. */
let botRechte = 0n;
for (const r of rollen) {
  if (r.id === SERVER || mitglied?.roles?.includes(r.id)) botRechte |= BigInt(r.permissions);
}
const darf = (bit) => (botRechte & R.ADMIN) === R.ADMIN || (botRechte & bit) === bit;

const plan = [];
const hinweise = [];
const schritt = (art, was, tun) => plan.push({ art, was, tun });

/* ===================================================================== Schutz (nie loeschen) */

const ueber = (k, id) => (k.permission_overwrites ?? []).find((o) => o.id === id);
const privat = (k) => {
  const ev = ueber(k, SERVER);
  if (ev) return (BigInt(ev.deny) & R.VIEW) === R.VIEW;
  const eltern = kanaele.find((x) => x.id === k.parent_id);
  const ee = eltern && ueber(eltern, SERVER);
  return Boolean(ee && (BigInt(ee.deny) & R.VIEW) === R.VIEW);
};
const discordKanaele = new Set([gilde.rules_channel_id, gilde.public_updates_channel_id, gilde.safety_alerts_channel_id,
  gilde.afk_channel_id, gilde.widget_channel_id, gilde.system_channel_id].filter(Boolean));

function schutz(k) {
  const n = k.name.toLowerCase();
  if (k.type === 2 || k.type === 13) return 'Sprach-/Buehnenkanal';
  if (k.id === VIP_KATEGORIE || BEKANNTE_IDS.includes(k.id)) return 'fest im Code (lib/discord.ts)';
  if (discordKanaele.has(k.id)) return 'von Discord gebraucht (Regeln/Updates/System/AFK)';
  if (k.type === 4) {
    if (CODE_KATEGORIEN.includes(kern(k.name))) return 'Kategorie, die der Code sucht';
    if (kanaele.some((x) => x.parent_id === k.id)) return 'Kategorie mit Inhalt';
    return null;
  }
  if (CODE_KANAELE.includes(n) || CODE_KANAELE.includes(kern(n))) return 'Kanal, den der Code sucht';
  if (CODE_MUSTER.some((m) => m.test(n) || m.test(kern(n)))) return 'Kanal nach Code-Muster (Schluessel/Ticket/Chat/Admin)';
  if (privat(k)) return 'privat';
  const eltern = kanaele.find((x) => x.id === k.parent_id);
  if (eltern && (eltern.id === VIP_KATEGORIE || CODE_KATEGORIEN.filter((c) => c !== 'community').includes(kern(eltern.name)))) {
    return `liegt in der Code-Kategorie "${eltern.name}"`;
  }
  return null;
}

/* ============================================================================ Rechte bauen */

function zielRechte(art, typ) {
  const ow = [];
  const s = (x) => String(x);
  if (art === 'aushang') ow.push({ id: SERVER, type: 0, allow: s(LESEN), deny: s(NICHT_SCHREIBEN) });
  if (art === 'chat') ow.push({ id: SERVER, type: 0, allow: s(CHAT), deny: s(R.MENTION_ALL) });
  // Nur Befehle: lesen und Slash-Befehle ja, schreiben, Threads und Anhaenge nein (die Antworten schreibt der Bot).
  if (art === 'befehle') ow.push({ id: SERVER, type: 0, allow: s(LESEN | R.CMDS), deny: s(NICHT_SCHREIBEN | R.ATTACH | R.MENTION_ALL) });
  if (art === 'forum') ow.push({ id: SERVER, type: 0, allow: s(CHAT | R.SEND_THREADS), deny: s(R.MENTION_ALL) });
  ow.push({ id: ich.id, type: 1, allow: s(VOLL | (typ === 15 ? R.MANAGE_THREADS : 0n)), deny: '0' });
  if (adminRolle) ow.push({ id: adminRolle.id, type: 0, allow: s(VOLL | R.MANAGE_THREADS), deny: '0' });
  // Wie proSichtEinrichten in lib/discord.ts: Pro sieht die oeffentlichen Kanaele nicht, "Pro News" schon.
  if (proRolle) ow.push({ id: proRolle.id, type: 0, allow: '0', deny: s(R.VIEW) });
  if (proNewsRolle) ow.push({ id: proNewsRolle.id, type: 0, allow: s(R.VIEW), deny: '0' });
  return ow;
}
const owText = (o) => `${o.id}:${o.type}:${o.allow}:${o.deny}`;
/** Unsere Regeln ueber die vorhandenen legen - fremde Eintraege (von Hand gesetzt) bleiben. */
function zusammen(vorhanden, ziel) {
  const ids = new Set(ziel.map((o) => o.id));
  return [...(vorhanden ?? []).filter((o) => !ids.has(o.id)).map(({ id, type, allow, deny }) => ({ id, type: Number(type), allow: String(allow), deny: String(deny) })), ...ziel];
}
const rechteWeichen = (vorhanden, ziel) => {
  const da = new Set((vorhanden ?? []).map((o) => owText({ ...o, type: Number(o.type) })));
  return ziel.some((o) => !da.has(owText(o)));
};

/* ============================================================================== Der Plan */

const idVon = new Map(); // kern -> Kanal-Id (waechst beim Anwenden)
const katId = new Map(); // schluessel -> Kategorie-Id
const kategorien = () => kanaele.filter((k) => k.type === 4);
const neueKategorien = new Set();

// --- INFORMATION: die Kategorie, in der #welcome liegt (lib/discord.ts nimmt genau deren parent_id).
const welcomeKanal = kanaele.find((k) => istText(k.type) && kern(k.name) === 'welcome');
{
  const eltern = welcomeKanal && kategorien().find((k) => k.id === welcomeKanal.parent_id);
  const z = ZIEL[0];
  if (eltern && !CODE_KATEGORIEN.filter((c) => c !== 'welcome').includes(kern(eltern.name))) {
    katId.set('info', eltern.id);
    if (eltern.name !== z.name) {
      schritt('umbenennen', `Kategorie "${eltern.name}" -> "${z.name}" (sicher: der Code nimmt die Kategorie von #welcome ueber die Id)`,
        () => ruf(`/channels/${eltern.id}`, 'PATCH', { name: z.name }));
    }
  } else {
    const schon = kategorien().find((k) => kern(k.name) === 'information');
    if (schon) katId.set('info', schon.id);
    else {
      neueKategorien.add('info');
      schritt('anlegen', `Kategorie "${z.name}"`, async () => {
        const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', { name: z.name, type: 4 });
        katId.set('info', neu.id);
      });
    }
  }
}

// --- COMMUNITY: die vorhandene Kategorie "Community" (lib/discord.ts kategorieFuer('Community')).
{
  const z = ZIEL[1];
  const schon = kategorien().find((k) => kern(k.name) === 'community');
  if (schon) {
    katId.set('community', schon.id);
    if (EMOJI && schon.name !== z.emojiName) {
      schritt('umbenennen', `Kategorie "${schon.name}" -> "${z.emojiName}" (--emoji-namen)`,
        () => ruf(`/channels/${schon.id}`, 'PATCH', { name: z.emojiName }));
    }
  } else {
    neueKategorien.add('community');
    const name = EMOJI ? z.emojiName : z.name;
    schritt('anlegen', `Kategorie "${name}"`, async () => {
      const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', { name, type: 4 });
      katId.set('community', neu.id);
    });
  }
}

// --- Die Kanaele.
const imZiel = new Set();
for (const gruppe of ZIEL) {
  for (const z of gruppe.kanaele) {
    const typ = z.typ ?? 0;
    const namen = [z.kern, ...(z.aliase ?? [])];
    const treffer = kanaele
      .filter((k) => k.type !== 4 && namen.includes(kern(k.name)))
      .sort((a, b) => (namen.indexOf(kern(a.name)) - namen.indexOf(kern(b.name))) || (a.id < b.id ? -1 : 1));
    const passend = treffer.filter((k) => (typ === 15 ? k.type === 15 : istText(k.type)));
    let k = passend.find((x) => x.parent_id === katId.get(gruppe.schluessel)) ?? passend[0];
    const sollName = z.code ? (EMOJI && z.emoji ? z.emoji : k?.name ?? z.kern) : z.name;

    for (const t of treffer) {
      if (t === k) continue;
      imZiel.add(t.id); // nicht noch einmal als "uebrig" zaehlen
      const grund = schutz(t);
      const warum = t.type !== typ && typ === 15
        ? `#${t.name} ist ein Textkanal - Discord kann Text nicht in ein Forum umwandeln; das Forum wird neu angelegt`
        : `#${t.name} ist eine Dopplung von #${sollName}`;
      if (grund) hinweise.push(`${warum}; bleibt stehen (${grund}).`);
      else schritt('loesch-kandidat', `${warum} (letzte Nachricht ${wann(t.last_message_id)})`, async () => {
        if (LOESCHEN) await ruf(`/channels/${t.id}`, 'DELETE');
      });
    }

    if (!k) {
      if (z.optional) continue;
      if (z.code) {
        hinweise.push(`#${z.kern} fehlt - wird mit ${typ === 15 ? 'Forum' : 'Text'}-Rechten wie im Code angelegt; `
          + 'danach im Admin "Server einrichten" laufen lassen, damit lib/discord.ts die Begruessung stellt.');
      }
      const rechte = zielRechte(z.rechte ?? 'aushang', typ);
      schritt('anlegen', `${typ === 15 ? 'Forum' : 'Kanal'} #${z.code ? z.kern : z.name} in "${gruppe.name}"`
        + (typ === 15 ? ` mit Tags ${FOREN[z.kern].tags.map((t) => t.name).join(', ')}` : ''), async () => {
        const koerper = {
          name: z.code ? (EMOJI && z.emoji ? z.emoji : z.kern) : z.name,
          type: typ, parent_id: katId.get(gruppe.schluessel), permission_overwrites: rechte,
          ...(z.thema ? { topic: z.thema } : {}),
        };
        if (typ === 15) {
          const f = FOREN[z.kern];
          Object.assign(koerper, {
            topic: f.topic, available_tags: f.tags, default_reaction_emoji: { emoji_name: f.reaktion },
            default_sort_order: 0, default_forum_layout: 1,
          });
        }
        const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', koerper);
        idVon.set(z.kern, neu.id);
      });
      continue;
    }

    imZiel.add(k.id);
    idVon.set(z.kern, k.id);
    if (k.name !== sollName) {
      if (z.code && !EMOJI) { /* Name bleibt - der Code sucht ihn */ } else {
        schritt('umbenennen', `#${k.name} -> #${sollName}${z.code ? '  ⚠ Code sucht den alten Namen (nur mit Patch!)' : ''}`,
          () => ruf(`/channels/${k.id}`, 'PATCH', { name: sollName }));
      }
    }
    const sollEltern = katId.get(gruppe.schluessel);
    if (k.parent_id !== sollEltern || neueKategorien.has(gruppe.schluessel)) {
      schritt('verschieben', `#${k.name} -> "${gruppe.name}"${z.wache ? `  (Hinweis: ${z.wache} schiebt ihn beim naechsten "Server einrichten" zurueck)` : ''}`,
        // Nur die Kategorie - die Regeln des Kanals bleiben, wie der Code sie gesetzt hat.
        () => ruf(`/channels/${k.id}`, 'PATCH', { parent_id: katId.get(gruppe.schluessel) }));
    }
    if (!z.code) {
      const rechte = zielRechte(z.rechte, typ);
      if (rechteWeichen(k.permission_overwrites, rechte)) {
        schritt('rechte', `#${k.name}: Rechte (${z.rechte}) setzen - fremde Eintraege bleiben`,
          () => ruf(`/channels/${k.id}`, 'PATCH', { permission_overwrites: zusammen(k.permission_overwrites, rechte) }));
      }
      const sollThema = typ === 15 ? FOREN[z.kern].topic : z.thema;
      if (sollThema && (k.topic ?? '') !== sollThema) {
        schritt('thema', `#${k.name}: Beschreibung`, () => ruf(`/channels/${k.id}`, 'PATCH', { topic: sollThema }));
      }
      if (typ === 15) {
        const da = new Set((k.available_tags ?? []).map((t) => t.name.toLowerCase()));
        const fehlt = FOREN[z.kern].tags.filter((t) => !da.has(t.name.toLowerCase()));
        if (fehlt.length) {
          schritt('tags', `#${k.name}: Tags ergaenzen (${fehlt.map((t) => t.name).join(', ')}) - vorhandene bleiben`,
            () => ruf(`/channels/${k.id}`, 'PATCH', { available_tags: [...(k.available_tags ?? []), ...fehlt].slice(0, 20) }));
        }
      }
    }
  }
}

// --- Reihenfolge: INFORMATION, COMMUNITY, dann alle uebrigen Kategorien wie bisher.
function ordnung(liste) {
  const aenderungen = [];
  const pos = (id, i) => { const k = liste.find((x) => x.id === id); if (k && k.position !== i) aenderungen.push({ id, position: i }); };
  const vorne = ['info', 'community'].map((s) => katId.get(s)).filter(Boolean);
  const katListe = liste.filter((k) => k.type === 4).sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
  [...vorne, ...katListe.map((k) => k.id).filter((id) => !vorne.includes(id))].forEach(pos);
  for (const gruppe of ZIEL) {
    const kat = katId.get(gruppe.schluessel);
    const zielIds = gruppe.kanaele.map((z) => {
      const namen = [z.kern, ...(z.aliase ?? [])];
      return liste.find((k) => k.parent_id === kat && k.type !== 4 && namen.includes(kern(k.name)))?.id;
    }).filter(Boolean);
    const rest = liste.filter((k) => k.parent_id === kat && (istText(k.type) || k.type === 15) && !zielIds.includes(k.id))
      .sort((a, b) => a.position - b.position).map((k) => k.id);
    [...zielIds, ...rest].forEach(pos);
  }
  return aenderungen;
}
if (plan.some((p) => ['anlegen', 'verschieben'].includes(p.art)) || ordnung(kanaele).length) {
  schritt('ordnen', 'Reihenfolge: Kategorien (Information, Community, Rest wie bisher) und Kanaele darin wie im Ziel', async () => {
    kanaele = await ruf(`/guilds/${SERVER}/channels`);
    const aenderungen = ordnung(kanaele);
    if (aenderungen.length) await ruf(`/guilds/${SERVER}/channels`, 'PATCH', aenderungen);
    console.log(`    ${aenderungen.length} Positionen geaendert`);
  });
}

// --- Systemkanal: Discords eigene Beitrittsmeldungen nach #system-messages.
{
  const sys = idVon.get('system-messages');
  // Beitrittsmeldungen an (Bit 0 aus), Einrichtungstipps aus (Bit 2 an); Boosts und Sticker-Antworten wie bisher.
  const flags = ((gilde.system_channel_flags ?? 0) & ~1) | 4;
  if (!sys || gilde.system_channel_id !== sys || gilde.system_channel_flags !== flags) {
    schritt('systemkanal', `Systemkanal des Servers -> #system-messages (Beitritte an, Einrichtungstipps aus)${darf(R.MANAGE_GUILD) ? '' : '  ⚠ Bot fehlt "Server verwalten"'}`,
      () => ruf(`/guilds/${SERVER}`, 'PATCH', { system_channel_id: idVon.get('system-messages'), system_channel_flags: flags }));
  }
}

// --- Die oeffentlichen Slash-Befehle fuer #check-stats (/stats, /cup, /help) als Gildenbefehle.
// Einzeln angelegt (POST ersetzt nur den gleichnamigen) - /comphub und andere bleiben, wie sie sind.
{
  const app = await ruf('/applications/@me').catch(() => null);
  const appId = app?.id ?? ich.id;
  const da = await ruf(`/applications/${appId}/guilds/${SERVER}/commands`).catch(() => []);
  const fingerabdruck = (b) => JSON.stringify([b.name, b.description, (b.options ?? []).map((o) => [o.type, o.name, o.description,
    Boolean(o.required), Boolean(o.autocomplete), o.max_length ?? null, (o.choices ?? []).map((c) => c.value)])]);
  for (const b of STATS_BEFEHLE) {
    const vorhanden = da.find((x) => x.name === b.name);
    if (vorhanden && fingerabdruck(vorhanden) === fingerabdruck(b)) continue;
    schritt('befehle', `Slash-Befehl /${b.name} ${vorhanden ? 'aktualisieren' : 'anmelden'} (Gildenbefehl, Antworten: app/api/discord/interaktion)`,
      () => ruf(`/applications/${appId}/guilds/${SERVER}/commands`, 'POST', b));
  }
}

// --- Willkommensnachricht in #welcome.
const loeschBotNachrichten = [];
if (WILLKOMMEN) {
  const wk = idVon.get('welcome');
  const verlauf = wk ? await ruf(`/channels/${wk}/messages?limit=50`).catch(() => []) : [];
  const eigene = verlauf.filter((m) => m.author?.id === ich.id);
  const markiert = eigene.find((m) => m.embeds?.[0]?.footer?.text === WILLKOMMEN_MARKE);
  // Noch keine neue? Dann den alten Aushang von "Server einrichten" (gleicher Titel, angepinnt) umschreiben - der Pin bleibt,
  // der Knopf "Read in German" faellt weg (die neue Fassung ist nur englisch).
  const alterAushang = markiert ? null
    : eigene.filter((m) => m.embeds?.[0]?.title === 'Welcome to CompHub').sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))[0] ?? null;
  const unsere = markiert ?? alterAushang;
  const verweis = (zuletzt) => (n) => {
    const k = zuletzt.find((x) => x.type !== 4 && (kern(x.name) === n || (n === 'comphub-updates' && kern(x.name) === 'updates')));
    return k ? `<#${k.id}>` : `#${n}`;
  };
  const vergleich = (e) => JSON.stringify([e?.title, e?.description, (e?.fields ?? []).map((f) => [f.name, f.value])]);
  if (unsere) {
    const soll = willkommen(verweis(kanaele));
    // Kanalverweise auf noch nicht angelegte Kanaele aendern den Text - dann neu schreiben.
    if (vergleich(unsere.embeds[0]) !== vergleich(soll) || ZIEL.some((g) => g.kanaele.some((z) => !z.code && !idVon.has(z.kern)))) {
      schritt('willkommen', `#welcome: ${alterAushang ? 'den alten Aushang von "Server einrichten" durch die neue Willkommensnachricht ersetzen' : 'unsere Willkommensnachricht auf den neuen Stand bringen'} (bearbeiten, Pin bleibt)`, async () => {
        const frisch = await ruf(`/guilds/${SERVER}/channels`);
        await ruf(`/channels/${wk}/messages/${unsere.id}`, 'PATCH', { embeds: [willkommen(verweis(frisch))], components: [] });
      });
    }
  } else {
    schritt('willkommen', '#welcome: neue Willkommensnachricht posten und anpinnen', async () => {
      const frisch = await ruf(`/guilds/${SERVER}/channels`);
      const ziel = idVon.get('welcome') ?? frisch.find((k) => istText(k.type) && kern(k.name) === 'welcome')?.id;
      const neu = await ruf(`/channels/${ziel}/messages`, 'POST', { embeds: [willkommen(verweis(frisch))] });
      await ruf(`/channels/${ziel}/pins/${neu.id}`, 'PUT');
      // Discords Zeile "CompHub pinned a message" wieder weg (wie anpinnen() in lib/discord.ts).
      const neueste = await ruf(`/channels/${ziel}/messages?limit=3`);
      for (const m of neueste) if (m.type === 6) await ruf(`/channels/${ziel}/messages/${m.id}`, 'DELETE');
    });
  }
  for (const m of eigene) {
    if (m.id === unsere?.id) continue;
    loeschBotNachrichten.push(m);
    schritt('loesch-kandidat', `#welcome: alte Bot-Nachricht "${m.embeds?.[0]?.title ?? m.content?.slice(0, 40) ?? m.id}" (${wann(m.id)})`, async () => {
      if (LOESCHEN) await ruf(`/channels/${wk}/messages/${m.id}`, 'DELETE');
    });
  }
}

// --- Doppelte Kategorien (15.11.2026: zwei "Admin" - die zweite leer). Gleicher Name ohne Emoji: die leere geht, eine mit Kanaelen wird nur gemeldet.
{
  const norm = (n) => String(n).replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase();
  const gruppen = new Map();
  for (const k of kategorien()) { const g = gruppen.get(norm(k.name)) ?? []; g.push(k); gruppen.set(norm(k.name), g); }
  for (const [n, g] of gruppen) {
    if (g.length < 2) continue;
    const kinder = (k) => kanaele.filter((c) => c.parent_id === k.id);
    const voll = g.filter((k) => kinder(k).length);
    for (const k of g) {
      const z = kinder(k);
      console.log(`Doppelte Kategorie "${k.name}" (${k.id}): ${z.length} Kanaele${z.length ? ` - ${z.map((c) => c.name).join(', ')}` : ''}`);
      if (!z.length && voll.length) {
        schritt('loesch-kandidat', `leere doppelte Kategorie "${k.name}" (${k.id}) - die andere "${n}" hat die Kanaele`,
          async () => { if (LOESCHEN) await ruf(`/channels/${k.id}`, 'DELETE'); });
      }
    }
  }
}

// --- Was sonst noch oeffentlich herumsteht und niemand braucht.
for (const k of kanaele) {
  if (imZiel.has(k.id) || [...katId.values()].includes(k.id)) continue;
  if (![0, 5, 15, 4].includes(k.type)) continue;
  if (schutz(k)) continue;
  schritt('loesch-kandidat', `${k.type === 4 ? 'leere Kategorie' : `#${k.name}`} "${k.name}" - weder im Ziel noch im Code (letzte Nachricht ${wann(k.last_message_id)})`,
    async () => { if (LOESCHEN) await ruf(`/channels/${k.id}`, 'DELETE'); });
}

/* =============================================================================== Ausgabe */

console.log(`\nServer: ${gilde.name} (${SERVER}) · Funktionen: ${(gilde.features ?? []).join(', ') || '-'}`);
console.log(`Bot: ${ich.username} · darf Kanaele verwalten: ${darf(R.MANAGE_CHANNELS) ? 'ja' : 'NEIN'}, `
  + `Server verwalten: ${darf(R.MANAGE_GUILD) ? 'ja' : 'NEIN'}, Rollen verwalten: ${darf(R.MANAGE_ROLES) ? 'ja' : 'NEIN'}`);
if (!(gilde.features ?? []).includes('COMMUNITY')) {
  hinweise.push('Der Server ist kein "Community"-Server. Foren sollten trotzdem gehen; scheitert das Anlegen, '
    + 'in den Servereinstellungen "Community aktivieren" und erneut laufen lassen.');
}
console.log('\nRollen, auf die sich der Code verlaesst:');
for (const n of CODE_ROLLEN) console.log(`  ${rolleNach.has(n) ? '✓' : '·'} ${n}${rolleNach.has(n) ? '' : ' (fehlt - legt der Code bei Bedarf an)'}`);
console.log(`  ${adminRolle ? '✓' : '✗'} Admin-Rolle (Recht Administrator): ${adminRolle?.name ?? 'keine gefunden'}`);

console.log(`\nZiel:`);
for (const g of ZIEL) {
  console.log(`  ${g.name.toUpperCase()}`);
  for (const z of g.kanaele) {
    const da = idVon.get(z.kern);
    const k = da && kanaele.find((x) => x.id === da);
    const name = k?.name ?? (z.code ? (EMOJI && z.emoji ? z.emoji : z.kern) : z.name);
    console.log(`    ${z.typ === 15 ? '🗂' : '#'} ${name}${z.code ? '  [Code]' : ''}${!k ? (z.optional ? '  (fehlt, optional)' : '  (neu)') : ''}`);
  }
}

const reihenfolge = ['anlegen', 'umbenennen', 'verschieben', 'rechte', 'thema', 'tags', 'systemkanal', 'befehle', 'willkommen', 'ordnen', 'loesch-kandidat'];
plan.sort((a, b) => reihenfolge.indexOf(a.art) - reihenfolge.indexOf(b.art));
console.log(`\nPlan (${plan.filter((p) => p.art !== 'ordnen').length} Schritte${plan.some((p) => p.art === 'ordnen') ? ' + Reihenfolge' : ''}):`);
for (const p of plan) console.log(`  [${p.art}] ${p.was}`);
if (hinweise.length) { console.log('\nHinweise:'); for (const h of hinweise) console.log(`  - ${h}`); }

if (EMOJI) {
  console.log('\n⚠ --emoji-namen: lib/discord.ts (gleich(), kategorieFuer(), PRO_IMMER_SICHTBAR), scripts/live-discord.mjs,\n'
    + '  ergebnisse-discord.mjs und discord-update.mjs suchen die Namen genau. Ohne toleranten Abgleich legen sie\n'
    + '  beim naechsten Lauf #news, #results, #live-now, #updates und die Kategorie "Community" doppelt an.');
}

if (!ANWENDEN) {
  console.log('\nNur Plan - nichts geaendert. Ausfuehren mit --anwenden (Loesch-Kandidaten zusaetzlich mit --loeschen).');
  process.exit(0);
}

console.log('\nWird ausgefuehrt ...');
let fehler = 0;
for (const p of plan) {
  if (p.art === 'loesch-kandidat' && !LOESCHEN) continue;
  try {
    await p.tun();
    console.log(`  ✓ [${p.art}] ${p.was}`);
  } catch (e) {
    fehler += 1;
    console.log(`  ✗ [${p.art}] ${p.was}\n      ${e.message}`);
  }
  await warte(400);
}
if (!LOESCHEN && plan.some((p) => p.art === 'loesch-kandidat')) console.log('  (Loesch-Kandidaten uebersprungen - dafuer --loeschen)');
console.log(fehler ? `\n${fehler} Schritt(e) gescheitert - erneut laufen lassen, der Plan zeigt, was noch fehlt.` : '\nFertig. Ein zweiter Planlauf sollte leer sein.');
process.exitCode = fehler ? 1 : 0;
