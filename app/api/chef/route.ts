import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFileSync, spawn } from 'child_process';

/*
 * Die Schaltstelle zwischen dem Chef (Cloud-Routine, Zweig "claude/chef") und dem Betreiber - laeuft nur auf seinem PC (localhost:3200).
 *
 * GET  - holt den neuesten Stand des Zweigs (hoechstens einmal je Minute) und liefert Logbuch, Entscheidungen, Status.
 * POST - { id, entscheidung: 'ja' | 'nein' | 'aendern', notiz } schreibt die Entscheidung in chef/entscheidungen.json und schiebt sie
 *        nach GitHub; bei "ja" startet scripts/chef-uebernahme.mjs (Commits nach main, Server neu bauen, Netlify).
 *      - { pause: true | false } legt chef/PAUSE an oder entfernt es.
 *
 * Der Betreiber (31.10.2026): "oeffentlich ist das Neueste erst, wenn ich sage ja" - deshalb geht nichts ohne diesen Klick nach main.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ORDNER = process.cwd();
const CHEF = path.join(ORDNER, 'chef');
let zuletztGeholt = 0;

function nurLokal(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function lies<T>(name: string, standard: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(CHEF, name), 'utf8')) as T; } catch { return standard; }
}

/** Der GitHub-Schluessel aus der .env.local - fuer Pull und Push ohne Rueckfrage des Anmeldefensters. */
function gitKopf(): string[] {
  try {
    const env = fs.readFileSync(path.join(ORDNER, '.env.local'), 'utf8');
    const t = /^GITHUB_TOKEN=(.*)$/m.exec(env)?.[1]?.replace(/["\r]/g, '').trim();
    if (!t) return [];
    return ['-c', 'credential.helper=', '-c', `http.extraheader=Authorization: Basic ${Buffer.from(`x-access-token:${t}`).toString('base64')}`];
  } catch { return []; }
}

function git(args: string[]): string {
  return execFileSync('git', [...gitKopf(), ...args], { cwd: ORDNER, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
}

function holen(): string | null {
  if (Date.now() - zuletztGeholt < 60_000) return null;
  zuletztGeholt = Date.now();
  try { git(['pull', '-q', '--rebase', '--autostash', 'origin', 'claude/chef']); return null; } catch (e) { return String((e as Error).message).slice(0, 200); }
}

function schreibenUndSchieben(nachricht: string, aendern: () => void): string | null {
  try {
    git(['pull', '-q', '--rebase', '--autostash', 'origin', 'claude/chef']);
  } catch { /* ohne Netz trotzdem lokal festhalten */ }
  aendern();
  try {
    git(['add', 'chef']);
    git(['commit', '-q', '-m', nachricht]);
  } catch { /* nichts zu committen */ }
  for (let i = 0; i < 3; i += 1) {
    try { git(['push', '-q', 'origin', 'HEAD:claude/chef']); return null; } catch {
      try { git(['pull', '-q', '--rebase', 'origin', 'claude/chef']); } catch { /* naechster Versuch */ }
    }
  }
  return 'Gespeichert, aber GitHub hat den Stand gerade nicht angenommen - der naechste Klick versucht es erneut.';
}

/*
 * Die markierten Vorher/Nachher-Bilder (scripts/chef-bilder.mjs) entstehen von selbst, solange die Seite offen ist: hoechstens ein Lauf
 * zugleich, neu angestossen, wenn der letzte fertig ist. Das Skript macht nur Bilder fuer wartende Eintraege, die noch keine haben.
 */
let bilderLauf: ReturnType<typeof spawn> | null = null;
let bilderZuletzt = 0;
function bilderAnstossen() {
  if (bilderLauf || Date.now() - bilderZuletzt < 60_000) return;
  bilderZuletzt = Date.now();
  const log = fs.openSync(path.join(ORDNER, 'chef-bilder.log'), 'a');
  bilderLauf = spawn(process.execPath, [path.join(ORDNER, 'scripts', 'chef-bilder.mjs')], { cwd: ORDNER, stdio: ['ignore', log, log], windowsHide: true });
  bilderLauf.on('exit', () => { bilderLauf = null; });
}

export async function GET(request: Request) {
  if (!nurLokal(request)) return NextResponse.json({ ok: false, error: 'Nur auf dem PC des Betreibers.' });
  const fehler = holen();
  bilderAnstossen();
  return NextResponse.json({
    ok: true,
    holfehler: fehler,
    bilder: lies<Record<string, unknown>>('bilder.json', {}),
    bilderLaufen: !!bilderLauf,
    logbuch: lies<unknown[]>('logbuch.json', []),
    entscheidungen: lies<Record<string, unknown>>('entscheidungen.json', {}),
    status: lies<Record<string, unknown> | null>('status.json', null),
    pause: fs.existsSync(path.join(CHEF, 'PAUSE')),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!nurLokal(request)) return NextResponse.json({ ok: false, error: 'Nur auf dem PC des Betreibers.' });
  const body = await request.json().catch(() => ({})) as { id?: string; entscheidung?: string; notiz?: string; pause?: boolean };

  if (typeof body.pause === 'boolean') {
    const datei = path.join(CHEF, 'PAUSE');
    const fehler = schreibenUndSchieben(body.pause ? '[chef-betreiber] Pause' : '[chef-betreiber] Weiter', () => {
      if (body.pause) fs.writeFileSync(datei, `Pause seit ${new Date().toISOString()}\n`);
      else fs.rmSync(datei, { force: true });
    });
    return NextResponse.json({ ok: true, hinweis: fehler });
  }

  /*
   * "Alle annehmen" (Betreiber, 31.10.2026: "ich bin faul"): alle uebergebenen Eintraege auf einmal mit Ja - eine Entscheidungs-Datei, ein
   * Uebernahme-Lauf, der sie nacheinander nach main bringt, und am Ende ein Bau.
   */
  if (Array.isArray((body as { ids?: unknown }).ids)) {
    const ids = ((body as { ids: unknown[] }).ids).map(String).filter((x) => /^chef-\d+$/.test(x)).slice(0, 100);
    if (!ids.length) return NextResponse.json({ ok: false, error: 'Keine Einträge gewählt.' });
    const fehlerAlle = schreibenUndSchieben(`[chef-betreiber] ${ids.length} Einträge: ja`, () => {
      const alle = lies<Record<string, Record<string, unknown>>>('entscheidungen.json', {});
      for (const x of ids) alle[x] = { entscheidung: 'ja', notiz: '', zeit: new Date().toISOString(), uebernahme: { stand: 'laeuft', text: 'Wird gerade übernommen …' } };
      fs.writeFileSync(path.join(CHEF, 'entscheidungen.json'), `${JSON.stringify(alle, null, 2)}\n`);
    });
    const log = fs.openSync(path.join(ORDNER, 'chef-uebernahme.log'), 'a');
    spawn(process.execPath, [path.join(ORDNER, 'scripts', 'chef-uebernahme.mjs'), ...ids], { cwd: ORDNER, detached: true, stdio: ['ignore', log, log], windowsHide: true }).unref();
    return NextResponse.json({ ok: true, hinweis: fehlerAlle });
  }

  const id = String(body.id ?? '');
  const entscheidung = String(body.entscheidung ?? '');
  if (!/^chef-\d+$/.test(id) || !['ja', 'nein', 'aendern'].includes(entscheidung)) {
    return NextResponse.json({ ok: false, error: 'Unbekannter Eintrag oder Entscheidung.' });
  }
  const notiz = String(body.notiz ?? '').slice(0, 4000);
  const fehler = schreibenUndSchieben(`[chef-betreiber] ${id}: ${entscheidung}`, () => {
    const alle = lies<Record<string, Record<string, unknown>>>('entscheidungen.json', {});
    alle[id] = { entscheidung, notiz, zeit: new Date().toISOString(), ...(entscheidung === 'ja' ? { uebernahme: { stand: 'laeuft', text: 'Wird gerade übernommen …' } } : {}) };
    fs.writeFileSync(path.join(CHEF, 'entscheidungen.json'), `${JSON.stringify(alle, null, 2)}\n`);
  });

  if (entscheidung === 'ja') {
    // Losgeloest: Commits nach main, Server neu bauen, Netlify - dauert ein paar Minuten, die Seite fragt nach.
    const log = fs.openSync(path.join(ORDNER, 'chef-uebernahme.log'), 'a');
    spawn(process.execPath, [path.join(ORDNER, 'scripts', 'chef-uebernahme.mjs'), id], { cwd: ORDNER, detached: true, stdio: ['ignore', log, log], windowsHide: true }).unref();
  }
  return NextResponse.json({ ok: true, hinweis: fehler });
}
