/*
 * /link-account und /unlink-account (Betreiber, 15.11.2026): ein Discord-Nutzer verknuepft sein Epic-Konto - ueber die offizielle Epic-Anmeldung der
 * Seite (app/api/auth/epic/authorize + callback, "Verify with Epic Games"), wie bei Osirion/Kinch. Kein Code zum Abtippen, keine Geraete-Anmeldung:
 * CompHub erfaehrt nur die Epic-Konto-Id und den Anzeigenamen (oeffentlich). Einen genauen Platz hinter 10.000 gibt das NICHT her (Epic nennt ihn nur
 * mit einem Spiel-Token des Kontos selbst) - /stats zeigt fuer verknuepfte Nutzer nur, was wir ohnehin haben, und nimmt das Konto als "ich".
 *
 * Ablauf:
 *   1. /link-account antwortet (nur fuer den Fragenden) mit dem Knopf auf /api/auth/epic/authorize?discord=<Marke>. Die Marke ist mit dem Geheimnis
 *      der Seite unterschrieben (HMAC-SHA256), bindet die Discord-Id und gilt 10 Minuten, nur einmal (verlinkeMarke / pruefeMarke).
 *   2. authorize legt Marke und epic_oauth_art=discord als Cookie ab und geht wie immer zu Epic.
 *   3. callback bekommt von Epic die bestaetigte Konto-Id, prueft die Marke (Unterschrift, Frist, nicht verbraucht) und speichert discordId -> epicId.
 *
 * Gespeichert ueber die Ablage (lib/ablage) unter "discord-epic-links/" - kein Release-Ordner (lib/ablageGithub AM_RELEASE), also nie oeffentlich.
 * Dateinamen sind HMACs, der Inhalt AES-256-GCM-verschluesselt. Schluessel: LINK_SECRET, sonst wie lib/konten AUTH_COOKIE_SECRET / DISCORD_ /
 * TWITCH_CLIENT_SECRET. Ohne alles ist die Verknuepfung abgeschaltet.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { speicher } from '@/lib/ablage';

const ORDNER = 'discord-epic-links';
const MARKE_MS = 10 * 60_000;

interface Eintrag { discordId: string; epicId: string; displayName: string; seit: string }

/* ------------------------------------------------------------------ Schluessel */

function schluessel(): Buffer | null {
  const eigen = (process.env.LINK_SECRET || '').trim();
  if (eigen) return crypto.createHash('sha256').update(`comphub-link|${eigen}`).digest();
  const keks = (process.env.AUTH_COOKIE_SECRET || process.env.DISCORD_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || '').trim();
  if (keks) return crypto.createHash('sha256').update(`comphub-epic-link-v1|${keks}`).digest();
  return null;
}
export function verknuepfungMoeglich(): boolean { return schluessel() !== null; }

const hmac = (text: string) => crypto.createHmac('sha256', schluessel()!).update(text).digest();
const kennung = (art: 'd' | 'e' | 'n', id: string) => hmac(`${art}:${id.toLowerCase()}`).toString('hex').slice(0, 40);

function verschluesseln(wert: unknown): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', schluessel()!, iv);
  const inhalt = Buffer.concat([c.update(JSON.stringify(wert), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), inhalt]).toString('base64');
}
function entschluesseln<T>(text: string): T | null {
  try {
    const roh = Buffer.from(text, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', schluessel()!, roh.subarray(0, 12));
    d.setAuthTag(roh.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(roh.subarray(28)), d.final()]).toString('utf8')) as T;
  } catch { return null; }
}

/* ------------------------------------------------------------------ Die Marke */

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Eine unterschriebene Marke fuer diesen Discord-Nutzer: "<Inhalt>.<Unterschrift>", 10 Minuten gueltig. */
export function verlinkeMarke(discordId: string, jetzt = Date.now()): string | null {
  if (!verknuepfungMoeglich() || !/^\d{5,25}$/.test(discordId)) return null;
  const inhalt = b64(JSON.stringify({ d: discordId, n: crypto.randomBytes(12).toString('hex'), e: jetzt + MARKE_MS }));
  return `${inhalt}.${b64(hmac(`marke:${inhalt}`))}`;
}

/** Unterschrift und Frist pruefen (ohne sie zu verbrauchen). */
export function leseMarke(marke: string, jetzt = Date.now()): { discordId: string; nonce: string } | null {
  if (!verknuepfungMoeglich() || typeof marke !== 'string' || marke.length > 400) return null;
  const [inhalt, sig] = marke.split('.');
  if (!inhalt || !sig) return null;
  const soll = hmac(`marke:${inhalt}`);
  const ist = Buffer.from(sig, 'base64url');
  if (ist.length !== soll.length || !crypto.timingSafeEqual(ist, soll)) return null;
  try {
    const j = JSON.parse(Buffer.from(inhalt, 'base64url').toString('utf8')) as { d?: string; n?: string; e?: number };
    if (!j.d || !/^\d{5,25}$/.test(j.d) || !j.n || typeof j.e !== 'number' || j.e < jetzt) return null;
    return { discordId: j.d, nonce: j.n };
  } catch { return null; }
}

/** Die Marke verbrauchen: true nur beim ersten Mal (gemerkt in der Ablage, damit es auch einen Neustart ueberlebt). */
async function markeVerbrauchen(nonce: string): Promise<boolean> {
  const name = `${ORDNER}/n-${kennung('n', nonce)}.json`;
  if (await speicher.lies(name).catch(() => null)) return false;
  await speicher.schreib(name, Buffer.from(JSON.stringify({ t: Date.now() })));
  return true;
}

/* ------------------------------------------------------------------ Ablage */

const dateiD = (discordId: string) => `${ORDNER}/d-${kennung('d', discordId)}.json`;
const dateiE = (epicId: string) => `${ORDNER}/e-${kennung('e', epicId)}.json`;

async function liesEintrag(discordId: string): Promise<Eintrag | null> {
  const roh = await speicher.lies(dateiD(discordId));
  if (!roh) return null;
  try { const j = JSON.parse(roh.toString('utf8')) as { e?: string }; return j.e ? entschluesseln<Eintrag>(j.e) : null; } catch { return null; }
}

/** Ist dieser Discord-Nutzer verknuepft? */
export async function verknuepfungVon(discordId: string): Promise<{ epicId: string; displayName: string } | null> {
  if (!verknuepfungMoeglich() || !discordId) return null;
  const e = await liesEintrag(discordId).catch(() => null);
  return e ? { epicId: e.epicId, displayName: e.displayName } : null;
}

export type VerknuepfenErgebnis = { ok: true; ersetzt: boolean } | { ok: false; grund: 'aus' | 'marke' | 'verbraucht' | 'speichern' };

/**
 * Aus dem Rueckweg von Epic (app/api/auth/epic/callback, epic_oauth_art=discord): die Marke pruefen und discordId -> epicId speichern.
 * epicId kommt von Epic selbst (account_id des Tokens), nie vom Nutzer.
 */
export async function verknuepfeAusEpic(marke: string, epicId: string, displayName: string): Promise<VerknuepfenErgebnis> {
  if (!verknuepfungMoeglich()) return { ok: false, grund: 'aus' };
  const m = leseMarke(marke);
  if (!m || !/^[0-9a-f]{32}$/.test(epicId)) return { ok: false, grund: 'marke' };
  if (!(await markeVerbrauchen(m.nonce).catch(() => false))) return { ok: false, grund: 'verbraucht' };
  const alt = await liesEintrag(m.discordId).catch(() => null);
  const e: Eintrag = { discordId: m.discordId, epicId, displayName: displayName.slice(0, 60), seit: new Date().toISOString() };
  try {
    await speicher.schreib(dateiD(m.discordId), Buffer.from(JSON.stringify({ v: 2, e: verschluesseln(e) })));
    await speicher.schreib(dateiE(epicId), Buffer.from(JSON.stringify({ v: 2, e: verschluesseln({ discordId: m.discordId }) })));
  } catch { return { ok: false, grund: 'speichern' }; }
  if (alt && alt.epicId !== epicId) await speicher.loesche(dateiE(alt.epicId)).catch(() => null);
  return { ok: true, ersetzt: !!alt };
}

/** /unlink-account: die Zuordnung loeschen. */
export async function trennen(discordId: string): Promise<{ ok: boolean; war: boolean; displayName?: string }> {
  if (!verknuepfungMoeglich()) return { ok: false, war: false };
  const e = await liesEintrag(discordId);
  await speicher.loesche(dateiD(discordId)).catch(() => null);
  if (!e) return { ok: true, war: false };
  await speicher.loesche(dateiE(e.epicId)).catch(() => null);
  return { ok: true, war: true, displayName: e.displayName };
}

/** Nur fuer die Probe: verschluesselt schreiben, lesen, loeschen - mit einer Probe-Kennung. */
export async function probeAblage(): Promise<string> {
  if (!verknuepfungMoeglich()) return 'aus (kein LINK_SECRET / AUTH_COOKIE_SECRET / DISCORD_CLIENT_SECRET)';
  const id = `9${Date.now()}`;
  const marke = verlinkeMarke(id)!;
  const r1 = await verknuepfeAusEpic(marke, 'f'.repeat(32), 'probe');
  const r2 = await verknuepfeAusEpic(marke, 'f'.repeat(32), 'probe');
  const roh = (await speicher.lies(dateiD(id)))?.toString('utf8') ?? '';
  const da = await verknuepfungVon(id);
  const weg = await trennen(id);
  const nachher = await verknuepfungVon(id);
  await speicher.loesche(`${ORDNER}/n-${kennung('n', leseMarke(marke)!.nonce)}.json`).catch(() => null);
  return `erste Nutzung ${r1.ok ? 'ok' : 'FEHLER'}, zweite ${!r2.ok && r2.grund === 'verbraucht' ? 'abgelehnt (ok)' : 'FEHLER'}, gelesen ${da?.epicId === 'f'.repeat(32) ? 'ok' : 'FEHLER'}, `
    + `Klartext in Datei: ${/probe|ffff/.test(roh) ? 'JA (FEHLER)' : 'nein'}, getrennt ${weg.war && !nachher ? 'ok' : 'FEHLER'}`;
}

/** Die einfache Seite nach /link-account (Discord): ob es geklappt hat - englisch wie der Bot. */
export function discordSeite(stand: 'ok' | 'aus' | 'marke' | 'verbraucht' | 'speichern', name: string): NextResponse {
  const text: Record<typeof stand, [string, string]> = {
    ok: ['Epic account linked', `${name ? `Linked to <b>${name.replace(/[<>&"]/g, '')}</b>. ` : ''}You can close this tab and use <code>/stats</code> in Discord.`],
    aus: ['Linking is not available', 'Linking accounts is not switched on yet. Please try again later.'],
    marke: ['Link expired', 'This link is only valid for 10 minutes. Run <code>/link-account</code> in Discord again.'],
    verbraucht: ['Link already used', 'This link was already used. Run <code>/link-account</code> in Discord again if you want to link another account.'],
    speichern: ['Something went wrong', 'Your account could not be saved just now. Please run <code>/link-account</code> again in a minute.'],
  };
  const [titel, satz] = text[stand];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titel} · CompHub</title>`
    + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f17;color:#e5e7eb;font:16px/1.5 system-ui,sans-serif}'
    + 'main{max-width:420px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 12px;color:#fff}code{background:#1f2937;padding:1px 6px;border-radius:4px}'
    + `.z{font-size:40px;margin-bottom:8px}</style></head><body><main><div class="z">${stand === 'ok' ? '✅' : '⚠️'}</div><h1>${titel}</h1><p>${satz}</p></main></body></html>`;
  return new NextResponse(html, { status: stand === 'ok' ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

