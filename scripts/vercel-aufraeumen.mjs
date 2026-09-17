// Alte Vercel-Deployments loeschen und die Aufbewahrung auf einen Tag stellen.
//
// Anlass: "Functions Storage 37,35 GB von 10 GB" - jedes Deployment traegt
// seine Funktionen mit, und nach acht Tagen lagen 146 davon herum. Der
// Betreiber: "alle, die vom einen Tag spaeter waren, kannst du wieder
// loeschen ... nach 24 Stunden loescht es."
//
//   node scripts/vercel-aufraeumen.mjs            loeschen und Aufbewahrung setzen
//   node scripts/vercel-aufraeumen.mjs --probe    nur zeigen, was weg kaeme
//
// Weg kommt, was aelter als 24 Stunden ist - nie das Deployment, das gerade
// die Produktion ist. Danach steht die Aufbewahrung des Projekts auf einem
// Tag (Vercel behaelt trotzdem die zehn juengsten Produktions-Deployments),
// und Vercel raeumt von selbst nach.
//
// Zugang: VERCEL_TOKEN aus der Umgebung (ein Token von
// vercel.com/account/tokens), sonst das Token der Vercel-CLI (vercel login)
// - das der CLI nimmt die Schnittstelle nicht immer an. Projekt und Team
// stehen in .vercel/project.json. Dasselbe geht ohne Skript im Vercel-
// Dashboard: Projekt, Settings, "Deployment Retention" auf einen Tag.

import fs from 'node:fs';
import path from 'node:path';

const PROJEKT = process.cwd();
const probe = process.argv.includes('--probe');
const TAG_MS = 24 * 60 * 60 * 1000;

function token() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const orte = [
    path.join(process.env.APPDATA || '', 'xdg.data', 'com.vercel.cli', 'auth.json'),
    path.join(process.env.APPDATA || '', 'com.vercel.cli', 'auth.json'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.local', 'share', 'com.vercel.cli', 'auth.json'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', 'Library', 'Application Support', 'com.vercel.cli', 'auth.json'),
  ];
  for (const o of orte) {
    try { const t = JSON.parse(fs.readFileSync(o, 'utf8')).token; if (t) return t; } catch { /* nicht da */ }
  }
  console.error('Kein Vercel-Token gefunden - erst "vercel login", oder VERCEL_TOKEN setzen.');
  process.exit(1);
}

const { projectId, orgId } = JSON.parse(fs.readFileSync(path.join(PROJEKT, '.vercel', 'project.json'), 'utf8'));
const KOPF = { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' };

async function api(pfad, init = {}) {
  const r = await fetch(`https://api.vercel.com${pfad}${pfad.includes('?') ? '&' : '?'}teamId=${orgId}`, {
    ...init, headers: { ...KOPF, ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${pfad}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

async function main() {
  const projekt = await api(`/v9/projects/${projectId}`);
  const aktuell = new Set(Object.values(projekt.targets || {}).map((t) => t?.id).filter(Boolean));

  const alle = [];
  let until = null;
  for (;;) {
    const d = await api(`/v6/deployments?projectId=${projectId}&limit=100${until ? `&until=${until}` : ''}`);
    alle.push(...d.deployments);
    const weiter = d.pagination?.next;
    if (!weiter || !d.deployments.length) break;
    until = weiter;
  }
  const jetzt = Date.now();
  const alt = alle.filter((x) => jetzt - x.created > TAG_MS && !aktuell.has(x.uid));
  console.log('');
  console.log(`  Deployments : ${alle.length}, davon aelter als 24 Stunden: ${alt.length}`);
  console.log(`  Bleibt      : ${alle.length - alt.length} (juenger als ein Tag, und die Produktion)`);
  if (probe) {
    for (const x of alt.slice(0, 10)) console.log(`    ${new Date(x.created).toISOString().slice(0, 16)}  ${x.url}`);
    if (alt.length > 10) console.log(`    … und ${alt.length - 10} weitere`);
    console.log('\n  Nur eine Probe - nichts geloescht.\n');
    return;
  }

  let weg = 0; let fehler = 0;
  for (const x of alt) {
    try { await api(`/v13/deployments/${x.uid}`, { method: 'DELETE' }); weg += 1; }
    catch (e) { fehler += 1; console.log(`    ! ${x.url}: ${e.message}`); }
    if (weg % 25 === 0 && weg) console.log(`    ${weg}/${alt.length}`);
  }
  console.log(`  Geloescht   : ${weg}${fehler ? `, gescheitert: ${fehler}` : ''}`);

  const r = await api(`/v9/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({ deploymentExpiration: {
      expirationDays: 1, expirationDaysProduction: 1, expirationDaysCanceled: 1, expirationDaysErrored: 1,
      deploymentsToKeep: 10,
    } }),
  });
  const e = r.deploymentExpiration || {};
  console.log(`  Aufbewahrung: ${e.expirationDaysProduction ?? '?'} Tag(e), mindestens ${e.deploymentsToKeep ?? '?'} bleiben immer.`);
  console.log('');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
