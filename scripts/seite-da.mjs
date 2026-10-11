/*
 * Der Waechter: ist die Seite da - und wenn nicht, warum nicht?
 *
 * Der Betreiber (2.10.2026): "mach eine Art alle fuenf Minuten einen Report auf
 * Discord, ob die Seite da ist oder nicht. Wenn sie offline ist, muss das gesagt
 * werden, und ich will dann von dir wissen, wieso sie ein paar Mal einfach so
 * offline ist." Dieses Skript fragt die Startseite und meldet - nur beim
 * Wechsel, nicht alle fuenf Minuten dasselbe - nach #admin-alarm:
 *
 *   - offline: welche Antwort kam, und was sie nach allem, was sich aus den
 *     Kopfzeilen lesen laesst, bedeutet (Render pausiert, Server startet,
 *     Absturz, Zeitueberschreitung ...)
 *   - wieder da: nach wie vielen Minuten
 *
 * Aufruf im Ablauf .github/workflows/seite-da.yml (alle fuenf Minuten). GH_TOKEN
 * liefert die Laufliste, um den Wechsel zu erkennen und die Dauer zu rechnen.
 * Der Lauf selbst wird rot, solange die Seite weg ist - so kennt der naechste
 * Lauf den Zustand davor.
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASIS = (process.env.BASIS || 'https://www.thecomphub.com').replace(/\/+$/, '');
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Zwei Versuche im Abstand von zehn Sekunden - ein einzelner Ausreisser ist keine Stoerung. */
async function frage() {
  let letzter = null;
  for (let v = 1; v <= 2; v++) {
    const t0 = Date.now();
    try {
      // Nur das Lebenszeichen (zwei Buchstaben), nicht die ganze Startseite: siehe app/api/ping/route.ts.
      const r = await fetch(BASIS + '/api/ping', { redirect: 'follow', signal: AbortSignal.timeout(25_000), headers: { 'User-Agent': 'comphub-waechter' } });
      const text = r.status === 200 ? await r.text() : '';
      letzter = {
        status: r.status, ms: Date.now() - t0,
        routing: r.headers.get('x-render-routing') || '',
        cf: r.headers.get('cf-ray') || '',
        ok: r.status === 200 && text.trim() === 'ok',
      };
      if (letzter.ok) return letzter;
    } catch (e) {
      letzter = { status: 0, ms: Date.now() - t0, routing: '', cf: '', ok: false, fehler: String((e && e.cause && e.cause.code) || (e && e.message) || e).slice(0, 80) };
    }
    if (v < 2) await warte(10_000);
  }
  return letzter;
}

/** Was die Antwort bedeutet - so genau, wie die Kopfzeilen es hergeben. */
function ursache(a) {
  if (a.routing === 'suspend-by-user') return 'Der Dienst ist bei Render **pausiert** (suspend-by-user). Das geschieht von Hand im Render-Dashboard. Dort: Dienst öffnen → Resume.';
  if (a.routing === 'no-server') return 'Render hat gerade **keinen laufenden Server**: er startet neu (nach einem Aufspielen oder Absturz) oder wird nach Leerlauf geweckt.';
  if (a.routing === 'no-deploy') return 'Render hat noch **kein fertiges Aufspielen**: der Bau ist gescheitert oder läuft noch.';
  if (a.status === 502) return 'Der Server antwortet nicht (502): meist ein Neustart oder ein Absturz, zum Beispiel wegen Speichermangel.';
  if (a.status === 503) return `Dienst nicht verfügbar (503${a.routing ? ', Render: ' + a.routing : ''}).`;
  if (a.status === 504 || a.status === 524) return 'Der Server hat zu lange gebraucht (Zeitüberschreitung): die Startseite hing vermutlich an der Ablage (Supabase).';
  if (a.status === 0) return `Keine Verbindung (${a.fehler || 'Zeitüberschreitung'}): Cloudflare oder der Server ist nicht erreichbar.`;
  if (a.status === 200) return 'Der Server antwortet, aber nicht wie erwartet.';
  return `Unerwartete Antwort: HTTP ${a.status}${a.routing ? ', Render: ' + a.routing : ''}.`;
}

const a = await frage();

// Der Zustand davor: die letzten abgeschlossenen Laeufe dieses Ablaufs.
let verlauf = [];
try {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/seite-da.yml/runs?per_page=100&status=completed`, {
    headers: { Accept: 'application/vnd.github+json', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
  });
  if (r.ok) verlauf = (await r.json()).workflow_runs ?? [];
} catch { /* ohne Verlauf wird bei jedem Ausfall gemeldet */ }
// Neueste zuerst; abgebrochene Laeufe zaehlen nicht.
const echt = verlauf.filter((l) => l.conclusion === 'success' || l.conclusion === 'failure');
const vorher = echt[0] ? echt[0].conclusion : 'success';

const melde = (art, titel, text) => {
  try { execFileSync('node', ['scripts/discord-update.mjs', '--ziel', 'alarm', '--art', art, '--titel', titel, '--text', text], { stdio: 'inherit' }); }
  catch (e) { console.log('Discord:', e.message); }
};
const uhr = (iso) => new Date(iso).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

console.log(`${a.ok ? 'DA' : 'WEG'} · HTTP ${a.status} · ${a.ms} ms${a.routing ? ' · render=' + a.routing : ''}${a.cf ? ' · cf=' + a.cf : ''}`);

if (!a.ok && vorher !== 'failure') {
  melde('alarm', 'Seite ist offline', `${ursache(a)}\n\nAntwort: HTTP ${a.status}${a.routing ? ` · Render: ${a.routing}` : ''}${a.cf ? ` · Cloudflare ${a.cf}` : ''}\nNächste Prüfung in fünf Minuten; gemeldet wird erst wieder, wenn sie zurück ist.`);
}
if (a.ok && vorher === 'failure') {
  // Wie lange war sie weg: vom Beginn der Reihe fehlgeschlagener Laeufe bis jetzt.
  let beginn = null;
  for (const l of echt) { if (l.conclusion === 'failure') beginn = l.created_at; else break; }
  const min = beginn ? Math.max(1, Math.round((Date.now() - Date.parse(beginn)) / 60_000)) : null;
  melde('info', 'Seite wieder da', `Die Startseite antwortet wieder (${a.ms} ms).${beginn ? `\nAusfall seit etwa ${uhr(beginn)} Uhr, rund ${min} Minuten.` : ''}`);
}

fs.writeFileSync('seite-da.txt', `${a.ok ? 'DA' : 'WEG'} ${a.status}`);
process.exitCode = a.ok ? 0 : 1;
