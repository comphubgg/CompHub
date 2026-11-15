/*
 * Changelog nach #comphub-updates (bis zur Umbenennung: #updates) - aus den Git-Commits seit dem letzten Post.
 *
 * Der Betreiber (15.11.2026): "Changelog-Posts fuer echte Updates, kurze technische Stichpunkte wie ein
 * Versionslog - am besten von selbst aus unseren Commits." Form (Vorgabe):
 *
 *   **Web [v1.5.0] - Faster leaderboards and cleaner stat posts**
 *   One short sentence what this update is about.
 *   - added `killsMitFeed`: eliminations are no longer double-counted
 *   - ...
 *   (optional zweite Gruppe: eigener Satz, eigene Stichpunkte - z. B. die Fehlerbehebungen)
 *
 * Je Bereich ein Post (Web / Stats Agent / Discord Bot), jeder mit eigener Version; jeder Post hebt die
 * Nebenversion um eins (1.4.0 -> 1.5.0). Reine Hausarbeit (Probe-Commits, Daten-Staende, Merge,
 * Agenten-Dateien, nur Doku) faellt weg.
 *
 * ------------------------------------------------------------------ Woher das Englische kommt
 *
 * Die Commit-Betreffe sind deutsch; auf Discord ist alles englisch. Zwei Wege, in dieser Reihenfolge:
 *   1. Ein Trailer im Commit:  "Changelog: added `x`: what it means for users"  (mehrfach erlaubt),
 *      "Changelog-Fix: ..." fuer die zweite Gruppe, "Changelog: skip" schliesst den Commit aus.
 *   2. Ohne Trailer und mit ANTHROPIC_API_KEY: Claude fasst die Commits eines Bereichs zusammen.
 * Hat ein Commit weder Trailer noch geht Weg 2, wird er NICHT auf Deutsch gepostet - der Plan nennt ihn.
 *
 * ------------------------------------------------------------------ Gedaechtnis
 *
 * Der Kanal selbst (wie bei scripts/live-discord.mjs): die Fusszeile jedes Posts traegt Bereich, Version
 * und den letzten erfassten Commit ("Web v1.5.0 · 3f2a9c1b2d4e"). Der naechste Lauf liest die letzten
 * Bot-Nachrichten und macht dort weiter. Kein zweiter Speicher, der auseinanderlaufen koennte.
 *
 *   node scripts/discord-updates.mjs                 Plan: was gepostet wuerde (liest Discord nur)
 *   node scripts/discord-updates.mjs --anwenden      posten
 *   --seit <commit>   Startpunkt erzwingen (sonst: letzter Post, ohne Post: letzte 7 Tage)
 *   --ohne-discord    nur Git auswerten (kein Token noetig; Startpunkt dann --seit oder 7 Tage)
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { FARBE } from '../lib/discordVorlagen.mjs';

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
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const ANWENDEN = process.argv.includes('--anwenden');
const OHNE_DISCORD = process.argv.includes('--ohne-discord');

const BEREICHE = ['Web', 'Stats Agent', 'Discord Bot'];
const FUSS = /^(Web|Stats Agent|Discord Bot) v(\d+)\.(\d+)\.(\d+) · ([0-9a-f]{7,40})/;

/* ====================================================================== Discord */

async function ruf(weg, methode = 'GET', koerper) {
  if (methode !== 'GET' && !ANWENDEN) throw new Error('Planmodus');
  for (let v = 0; v < 5; v += 1) {
    const r = await fetch(`${API}${weg}`, {
      method: methode,
      headers: { Authorization: `Bot ${TOKEN}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
      ...(koerper ? { body: JSON.stringify(koerper) } : {}),
    });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await new Promise((x) => setTimeout(x, (j.retry_after ?? 2) * 1000 + 250)); continue; }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    return j;
  }
  throw new Error('zu oft gedrosselt');
}
const kern = (s) => String(s ?? '').toLowerCase().replace(/^[^a-z0-9]+/, '');

let kanal = null;
const stand = { sha: null, zeit: null, version: {} };
if (!OHNE_DISCORD) {
  if (!TOKEN) { console.error('DISCORD_BOT_TOKEN fehlt (oder --ohne-discord).'); process.exit(1); }
  const kanaele = await ruf(`/guilds/${SERVER}/channels`);
  kanal = kanaele.find((k) => (k.type === 0 || k.type === 5) && kern(k.name) === 'comphub-updates')
    ?? kanaele.find((k) => (k.type === 0 || k.type === 5) && kern(k.name) === 'updates');
  if (!kanal) { console.error('Weder #comphub-updates noch #updates gefunden - erst scripts/discord-umbau.mjs.'); process.exit(1); }
  const ich = await ruf('/users/@me');
  const verlauf = await ruf(`/channels/${kanal.id}/messages?limit=100`);
  for (const m of verlauf) { // neueste zuerst
    if (m.author?.id !== ich.id) continue;
    const f = FUSS.exec(m.embeds?.[0]?.footer?.text ?? '');
    if (!f) continue;
    if (!stand.sha) { stand.sha = f[5]; stand.zeit = m.timestamp; }
    if (!stand.version[f[1]]) stand.version[f[1]] = [Number(f[2]), Number(f[3]), Number(f[4])];
  }
}

/* ========================================================================== Git */

const git = (...a) => execFileSync('git', a, { cwd: PROJEKT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const gibt = (sha) => { try { git('cat-file', '-e', `${sha}^{commit}`); return true; } catch { return false; } };

const seit = arg('--seit') ?? stand.sha;
let bereich;
if (seit && gibt(seit)) bereich = [`${seit}..HEAD`];
else if (stand.zeit) bereich = [`--since=${stand.zeit}`, 'HEAD'];
else bereich = ['--since=7.days', 'HEAD'];
if (seit && !gibt(seit)) console.log(`Commit ${seit} nicht im Verlauf (flacher Klon?) - nehme die Zeit des letzten Posts.`);

const roh = git('log', '--no-merges', '--name-only', '--format=%x1e%H%x1f%an%x1f%s%x1f%b%x1f', ...bereich);
const commits = roh.split('\x1e').filter((x) => x.trim()).map((teil) => {
  const [sha, autor, betreff, text, dateienRoh] = teil.split('\x1f');
  return { sha, autor, betreff: betreff.trim(), text: text.trim(), dateien: (dateienRoh ?? '').split('\n').map((d) => d.trim()).filter(Boolean) };
}).reverse(); // aelteste zuerst
const kopf = git('rev-parse', 'HEAD').trim();

/* ================================================================ Sortieren */

function bereichVon(d) {
  if (/^(lib\/discord|app\/api\/discord\/|discord-bot\/|scripts\/[^/]*discord[^/]*|\.github\/workflows\/discord-)/.test(d)) return 'Discord Bot';
  if (/^(tools\/|scripts\/|\.github\/workflows\/|hf-space\/|pov-app\/)/.test(d)) return 'Stats Agent';
  if (/^(app\/|components\/|lib\/|public\/|middleware\.ts|next\.config|types\/)/.test(d)) return 'Web';
  return null;
}
const HAUSARBEIT = /^(Probe|Merge|chore|wip|tmp|Agenten|Stand|Daten[: ]|Revert "Probe)/i;
const NUR_NEBENSACHE = (d) => /^(data\/|tmp|.*\.md$|\.gitignore$|.*\.(txt|out)$)/.test(d);

const trailer = (text, name) => [...text.matchAll(new RegExp(`^${name}:\\s*(.+)$`, 'gim'))].map((m) => m[1].trim());

const gruppen = new Map(BEREICHE.map((b) => [b, []]));
const uebersprungen = [];
for (const c of commits) {
  const neu = trailer(c.text, 'Changelog');
  const fix = trailer(c.text, 'Changelog-Fix');
  if (neu.some((x) => /^skip$/i.test(x))) { uebersprungen.push([c, 'Changelog: skip']); continue; }
  if (/\[bot\]$/.test(c.autor)) { uebersprungen.push([c, 'Bot-Commit']); continue; }
  if (HAUSARBEIT.test(c.betreff) && !neu.length && !fix.length) { uebersprungen.push([c, 'Hausarbeit']); continue; }
  const wichtig = c.dateien.filter((d) => !NUR_NEBENSACHE(d));
  if (!wichtig.length && !neu.length && !fix.length) { uebersprungen.push([c, 'nur Daten/Doku']); continue; }
  const zaehl = new Map();
  for (const d of wichtig) { const b = bereichVon(d); if (b) zaehl.set(b, (zaehl.get(b) ?? 0) + 1); }
  const b = [...zaehl.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'Web';
  gruppen.get(b).push({ ...c, neu, fix });
}

/* ========================================================== Englisch: Claude */

/*
 * Nur, wenn ANTHROPIC_API_KEY gesetzt ist. Das SDK ist keine Abhaengigkeit des Projekts; der Ablauf
 * installiert es daneben (ANTHROPIC_SDK_ORT = Ordner mit node_modules/@anthropic-ai/sdk).
 */
async function claude() {
  if (!U.ANTHROPIC_API_KEY) return null;
  try {
    const ort = U.ANTHROPIC_SDK_ORT;
    const mod = ort
      ? await import(pathToFileURL(createRequire(path.join(ort, 'x.js')).resolve('@anthropic-ai/sdk')).href)
      : await import('@anthropic-ai/sdk');
    const Anthropic = mod.default ?? mod.Anthropic;
    return new Anthropic({ apiKey: U.ANTHROPIC_API_KEY });
  } catch (e) {
    console.log(`Claude nicht verfuegbar (${e.message}) - nur Commits mit Changelog-Trailer werden gepostet.`);
    return null;
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    skip: { type: 'boolean', description: 'true if nothing here is worth telling users (pure chores, experiments)' },
    summary: { type: 'string', description: 'max 8 words, no trailing period' },
    intro: { type: 'string', description: 'one short sentence' },
    bullets: { type: 'array', items: { type: 'string' } },
    fixes_intro: { type: 'string', description: 'one short sentence for the fixes group, empty if none' },
    fixes: { type: 'array', items: { type: 'string' } },
  },
  required: ['skip', 'summary', 'intro', 'bullets', 'fixes_intro', 'fixes'],
  additionalProperties: false,
};

async function zusammenfassen(client, bereichName, liste) {
  const eingabe = liste.map((c) => `- ${c.betreff}${c.text ? `\n  ${c.text.split('\n').filter((z) => !/^(Co-Authored-By|Claude-Session):/i.test(z)).join(' ').slice(0, 400)}` : ''}\n  files: ${c.dateien.slice(0, 8).join(', ')}`).join('\n');
  const r = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: 'You write the public changelog of CompHub (thecomphub.com, competitive Fortnite stats) for its Discord. '
      + 'Input: git commits, written in German. Output English only. Style: a version log for players and streamers - '
      + 'short, factual, no hype, no emojis. Each bullet starts with a lowercase verb (added, fixed, changed, removed, sped up) '
      + 'and may name the technical thing in backticks, e.g. "added `killsMitFeed`: eliminations are no longer double-counted". '
      + 'Merge commits that describe the same change. Leave out internal experiments, probes and refactors users cannot notice. '
      + 'Put bug fixes into "fixes" (with their own one-sentence intro), everything else into "bullets". At most 8 bullets per group. '
      + 'Never invent changes that are not in the commits.',
    messages: [{ role: 'user', content: `Area: ${bereichName}\nCommits (oldest first):\n${eingabe}` }],
  });
  if (r.stop_reason === 'refusal') throw new Error('Claude hat abgelehnt');
  if (r.stop_reason === 'max_tokens') throw new Error('Antwort abgeschnitten');
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

/* ================================================================ Posts bauen */

const fmtV = (v) => `v${v.join('.')}`;
const posts = [];
const ohneEnglisch = [];
let client;
for (const b of BEREICHE) {
  const liste = gruppen.get(b);
  if (!liste.length) continue;
  let inhalt = null;
  const mitTrailer = liste.filter((c) => c.neu.length || c.fix.length);
  const ohne = liste.filter((c) => !c.neu.length && !c.fix.length);
  if (ohne.length) {
    client ??= await claude();
    if (client) {
      try { inhalt = await zusammenfassen(client, b, liste); } catch (e) { console.log(`Claude (${b}): ${e.message}`); }
    }
  }
  if (!inhalt) {
    ohneEnglisch.push(...ohne.map((c) => [b, c]));
    if (!mitTrailer.length) continue;
    inhalt = {
      skip: false,
      summary: arg('--titel') ?? `${mitTrailer.length} change${mitTrailer.length === 1 ? '' : 's'}`,
      intro: 'What changed since the last update:',
      bullets: mitTrailer.flatMap((c) => c.neu),
      fixes_intro: mitTrailer.some((c) => c.fix.length) ? 'Fixes:' : '',
      fixes: mitTrailer.flatMap((c) => c.fix),
    };
  }
  if (inhalt.skip || (!inhalt.bullets.length && !inhalt.fixes.length)) continue;
  const alt = stand.version[b] ?? [1, -1, 0];
  const v = [alt[0], alt[1] + 1, 0];
  const punkt = (x) => `- ${x.replace(/^[-•*]\s*/, '')}`;
  const zeilen = [`**${b} [${fmtV(v)}] - ${inhalt.summary.replace(/\.$/, '')}**`, inhalt.intro, ...inhalt.bullets.map(punkt)];
  if (inhalt.fixes.length) zeilen.push('', inhalt.fixes_intro || 'Fixes:', ...inhalt.fixes.map(punkt));
  posts.push({ bereich: b, version: v, text: zeilen.join('\n').slice(0, 4000), anzahl: liste.length });
}

/* ==================================================================== Ausgabe */

console.log(`Kanal: ${kanal ? `#${kanal.name}` : '(ohne Discord)'} · letzter Stand: ${stand.sha ?? 'keiner'} · `
  + `Versionen: ${BEREICHE.map((b) => `${b} ${stand.version[b] ? fmtV(stand.version[b]) : '-'}`).join(', ')}`);
console.log(`Commits im Bereich: ${commits.length} · uebersprungen: ${uebersprungen.length}`);
for (const [c, w] of uebersprungen) console.log(`  · ${c.sha.slice(0, 8)} ${w}: ${c.betreff.slice(0, 90)}`);
if (ohneEnglisch.length) {
  console.log(`\nOhne englische Zeile (kein Trailer "Changelog:", kein ANTHROPIC_API_KEY) - werden NICHT gepostet:`);
  for (const [b, c] of ohneEnglisch) console.log(`  · [${b}] ${c.sha.slice(0, 8)} ${c.betreff.slice(0, 90)}`);
}
for (const p of posts) console.log(`\n----- ${p.bereich} ${fmtV(p.version)} (${p.anzahl} Commits)\n${p.text}`);
if (!posts.length) console.log('\nNichts zu posten.');

if (!ANWENDEN || OHNE_DISCORD) {
  if (posts.length) console.log('\nNur Plan - posten mit --anwenden.');
  process.exit(0);
}
for (const p of posts) {
  await ruf(`/channels/${kanal.id}/messages`, 'POST', {
    embeds: [{
      description: p.text, color: FARBE,
      footer: { text: `${p.bereich} ${fmtV(p.version)} · ${kopf.slice(0, 12)} · ${new Date().toISOString().slice(0, 10)}` },
    }],
  });
  console.log(`Gepostet: ${p.bereich} ${fmtV(p.version)}`);
}
/*
 * Wurde nichts gepostet, rueckt der Stand nicht vor - die Commits kommen beim naechsten Lauf wieder.
 * Wurde gepostet, gilt der Stand bis HEAD: Commits ohne englische Zeile (oben im Plan genannt) sind
 * dann vorbei. Deshalb zuerst den Plan ansehen oder ANTHROPIC_API_KEY hinterlegen.
 */
