// Uebernimmt eine vom Betreiber freigegebene Verbesserung des Chefs nach main und bringt sie live.
//
// Aufgerufen von app/api/chef (Knopf "Ja" auf localhost:3200/chef) mit der Id des Logbuch-Eintrags, z. B. "chef-7":
//   1. die Commits des Eintrags in einem Wegwerf-Arbeitsordner auf origin/main setzen (cherry-pick) und nach main schieben,
//   2. im Projektordner des PCs main nachziehen und "npm run veroeffentlichen" starten (der Waechter startet den Server neu),
//   3. Netlify Konto 2 neu bauen - hoechstens alle 6 Stunden (jeder Bau kostet 15 von 300 Punkten im Monat),
//   4. das Ergebnis in chef/entscheidungen.json festhalten (uebernahme.stand: live | auf-github | konflikt | fehler).
// Bei einem Konflikt bleibt main unberuehrt; der Chef loest ihn in seiner naechsten Runde selbst (chef/ANLEITUNG.md, Abschnitt 3).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawn } from 'child_process';

const ID = process.argv[2];
const CHEF_ORDNER = process.cwd();
const zeit = () => new Date().toISOString();
const log = (t) => console.log(`${zeit()} ${ID}: ${t}`);

function token() {
  for (const ort of [CHEF_ORDNER, hauptOrdner()]) {
    try {
      const t = /^GITHUB_TOKEN=(.*)$/m.exec(fs.readFileSync(path.join(ort, '.env.local'), 'utf8'))?.[1]?.replace(/["\r]/g, '').trim();
      if (t) return t;
    } catch { /* naechster Ort */ }
  }
  return '';
}
function kopf() {
  const t = token();
  return t ? ['-c', 'credential.helper=', '-c', `http.extraheader=Authorization: Basic ${Buffer.from(`x-access-token:${t}`).toString('base64')}`] : [];
}
const git = (cwd, args) => execFileSync('git', [...kopf(), ...args], { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();

let haupt = null;
function hauptOrdner() {
  if (haupt) return haupt;
  // Der erste Eintrag von "git worktree list" ist der Hauptordner (streamer-dashboard), dieser hier ist nur eine Arbeitskopie davon.
  const zeile = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: CHEF_ORDNER, encoding: 'utf8' }).split('\n').find((z) => z.startsWith('worktree '));
  haupt = path.resolve(zeile.slice('worktree '.length).trim());
  return haupt;
}

function ergebnis(stand, text, extra = {}) {
  log(`${stand} - ${text}`);
  const datei = path.join(CHEF_ORDNER, 'chef', 'entscheidungen.json');
  try { git(CHEF_ORDNER, ['pull', '-q', '--rebase', '--autostash', 'origin', 'claude/chef']); } catch { /* ohne Netz lokal festhalten */ }
  let alle = {};
  try { alle = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { /* neu */ }
  alle[ID] = { ...(alle[ID] ?? { entscheidung: 'ja' }), uebernahme: { stand, text, zeit: zeit(), ...extra } };
  fs.writeFileSync(datei, `${JSON.stringify(alle, null, 2)}\n`);
  try {
    git(CHEF_ORDNER, ['add', 'chef/entscheidungen.json']);
    git(CHEF_ORDNER, ['commit', '-q', '-m', `[chef-betreiber] ${ID}: ${stand}`]);
    for (let i = 0; i < 3; i += 1) {
      try { git(CHEF_ORDNER, ['push', '-q', 'origin', 'HEAD:claude/chef']); break; } catch { git(CHEF_ORDNER, ['pull', '-q', '--rebase', 'origin', 'claude/chef']); }
    }
  } catch (e) { log(`Festhalten: ${String(e.message).slice(0, 120)}`); }
}

async function netlify() {
  const marke = path.join(hauptOrdner(), 'data', 'chef-netlify.txt');
  const zuletzt = Number((() => { try { return fs.readFileSync(marke, 'utf8'); } catch { return '0'; } })()) || 0;
  if (Date.now() - zuletzt < 6 * 3600_000) return 'Netlify folgt mit dem nächsten Bau (höchstens alle 6 Stunden).';
  const r = await fetch('https://api.github.com/repos/comphubgg/CompHub/actions/workflows/netlify-bereitstellen.yml/dispatches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { ziel: 'live', konto: '2' } }),
  }).catch(() => null);
  if (!r?.ok) return 'Netlify ließ sich gerade nicht anstoßen.';
  fs.mkdirSync(path.dirname(marke), { recursive: true });
  fs.writeFileSync(marke, String(Date.now()));
  return 'Netlify baut neu.';
}

async function main() {
  if (!/^chef-\d+$/.test(ID ?? '')) throw new Error('Keine gueltige Id');
  const logbuch = JSON.parse(fs.readFileSync(path.join(CHEF_ORDNER, 'chef', 'logbuch.json'), 'utf8'));
  const eintrag = logbuch.find((e) => e.id === ID);
  const commits = (eintrag?.commits ?? []).filter((c) => /^[0-9a-f]{7,40}$/i.test(c));
  if (!commits.length) return ergebnis('fehler', 'Im Logbuch stehen zu diesem Eintrag keine Commits.');

  log('main holen und Commits setzen');
  git(CHEF_ORDNER, ['fetch', '-q', 'origin', 'main', 'claude/chef']);
  const weg = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-uebernahme-'));
  let mainSha = '';
  try {
    git(CHEF_ORDNER, ['worktree', 'add', '-q', '--detach', weg, 'origin/main']);
    /*
     * Jeden Commit einzeln, ohne ihn gleich festzuschreiben: die Chef-Dateien (Logbuch usw.) stehen im selben Commit, gibt es auf main aber
     * nicht - ein gewoehnliches cherry-pick meldete deshalb bei jedem Eintrag einen Konflikt (31.10.2026, alle vier ersten Freigaben).
     * Sie werden hier herausgenommen; bleibt danach ein echter Konflikt im Code, uebernimmt der Chef in seiner Runde.
     */
    const CHEF_PFADE = /^(chef\/|app\/chef\/|app\/api\/chef\/|scripts\/chef-uebernahme)/;
    let gesetzt = 0;
    for (const sha of commits) {
      try { git(weg, ['cherry-pick', '--no-commit', sha]); } catch { /* Konflikte unten pruefen */ }
      const beruehrt = git(weg, ['status', '--porcelain']).split(/\r?\n/).map((z) => z.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean);
      const chefDa = beruehrt.filter((d) => CHEF_PFADE.test(d));
      if (chefDa.length) {
        git(weg, ['rm', '-rq', '--cached', '--ignore-unmatch', '--', ...chefDa]);
        for (const d of chefDa) fs.rmSync(path.join(weg, d), { recursive: true, force: true });
      }
      const offen = git(weg, ['diff', '--name-only', '--diff-filter=U']);
      if (offen) {
        try { git(weg, ['cherry-pick', '--abort']); } catch { git(weg, ['reset', '-q', '--hard']); }
        return ergebnis('konflikt', `Passt nicht ohne Weiteres auf den aktuellen Stand der Seite (${offen.split(/\r?\n/).slice(0, 3).join(', ')}) - der Chef löst das in seiner nächsten Runde.`);
      }
      if (!git(weg, ['diff', '--cached', '--name-only'])) { try { git(weg, ['cherry-pick', '--quit']); } catch { /* nichts offen */ } continue; }
      const nachricht = git(weg, ['log', '-1', '--format=%B', sha]);
      git(weg, ['commit', '-q', '-m', `${nachricht}\n\n(übernommen aus ${sha.slice(0, 8)} nach Freigabe des Betreibers)`]);
      try { git(weg, ['cherry-pick', '--quit']); } catch { /* nichts offen */ }
      gesetzt += 1;
    }
    if (!gesetzt) return ergebnis('live', 'Diese Änderung steckte schon in der echten Seite - nichts weiter zu tun.');
    git(weg, ['push', '-q', 'origin', 'HEAD:main']);
    mainSha = git(weg, ['rev-parse', '--short', 'HEAD']);
    log(`auf main: ${mainSha}`);
  } catch (e) {
    return ergebnis('fehler', `GitHub hat die Übernahme abgelehnt: ${String(e.message).slice(0, 160)}`);
  } finally {
    try { git(CHEF_ORDNER, ['worktree', 'remove', '--force', weg]); } catch { fs.rmSync(weg, { recursive: true, force: true }); }
  }

  // Live auf dem PC: nur wenn der Projektordner sauber auf main steht - sonst wuerde ein halbfertiger eigener Stand mit veroeffentlicht.
  const h = hauptOrdner();
  let stand = 'auf-github';
  let text = `Auf GitHub (main ${mainSha}).`;
  try {
    const zweig = git(h, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const offen = git(h, ['status', '--porcelain', '--untracked-files=no']);
    if (zweig === 'main' && !offen) {
      git(h, ['pull', '-q', '--ff-only', 'origin', 'main']);
      const aus = fs.openSync(path.join(h, 'chef-veroeffentlichen.log'), 'a');
      // Ueber die Warteschlange (scripts/chef-bauen.mjs): mehrere Freigaben kurz hintereinander ergeben einen Bau nach dem anderen, nie zwei zugleich.
      spawn(process.execPath, [path.join(CHEF_ORDNER, 'scripts', 'chef-bauen.mjs')], { cwd: h, detached: true, stdio: ['ignore', aus, aus], windowsHide: true }).unref();
      stand = 'live';
      text = `Auf GitHub (main ${mainSha}); die Seite wird neu gebaut und ist in etwa 10 Minuten live.`;
    } else {
      text += ' Der Projektordner auf dem PC hatte gerade offene Arbeit - live geht es mit dem nächsten Veröffentlichen.';
    }
  } catch (e) { text += ` Neu bauen ging nicht: ${String(e.message).slice(0, 120)}`; }
  text += ` ${await netlify()}`;
  ergebnis(stand, text, { main: mainSha });
}

main().catch((e) => ergebnis('fehler', String(e?.message ?? e).slice(0, 200)));
