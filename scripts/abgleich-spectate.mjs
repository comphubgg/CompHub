/*
 * Pruefung der Live-Spectate-Spur (Recherche 26.11.2026): Epics events/download fuehrt je Turnierfenster "canLiveSpectate" und
 * metadata.liveSpectateAccessToken; die Bestenliste mit showLiveSessions=true hat "liveSessions". Offen: Ist liveSessions nur in Fenstern mit
 * canLiveSpectate gefuellt, und enthaelt es alle laufenden Sitzungen (auch Teams ohne Wertung)? Nur lesen, nichts speichern.
 *   node scripts/abgleich-spectate.mjs [REGIONEN, Standard EU,NAC]
 */
import { holeNutzerToken } from '../lib/replayKern.mjs';

const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const regionen = (process.argv[2] || 'EU,NAC').split(',');
const { token, accountId } = await holeNutzerToken();
const jetzt = Date.now();
const kurz = (o, n = 1200) => JSON.stringify(o).slice(0, n);

for (const region of regionen) {
  const r = await fetch(`${EVENTS}/api/v1/events/Fortnite/download/${accountId}?region=${region}&platform=Windows&teamAccountIds=${accountId}`, { headers: { Authorization: token } });
  if (!r.ok) { console.log(region, 'download HTTP', r.status, (await r.text()).slice(0, 300)); continue; }
  const d = await r.json();
  const fenster = (d.events ?? []).flatMap((e) => (e.eventWindows ?? []).map((w) => ({ eventId: e.eventId, ...w })));
  const mitSpectate = fenster.filter((w) => w.canLiveSpectate);
  const token2 = fenster.map((w) => w.metadata?.liveSpectateAccessToken).filter(Boolean);
  console.log(`\n=== ${region}: ${fenster.length} Fenster, canLiveSpectate=true: ${mitSpectate.length}, liveSpectateAccessToken: ${[...new Set(token2)].join(', ') || '-'}`);
  for (const w of mitSpectate.slice(0, 15)) console.log('  spectate:', w.eventId, w.eventWindowId, w.beginTime, '->', w.endTime, kurz(w.metadata ?? {}, 200));
  const live = fenster.filter((w) => Date.parse(w.beginTime) <= jetzt && Date.parse(w.endTime) >= jetzt);
  console.log(`  laufend: ${live.length}`);
  for (const w of live.slice(0, 6)) {
    const u = `${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(w.eventId)}/${encodeURIComponent(w.eventWindowId)}/${accountId}?page=0&rank=0&teamAccountIds=&showLiveSessions=true`;
    const lr = await fetch(u, { headers: { Authorization: token } });
    const lj = lr.ok ? await lr.json() : null;
    const ls = lj?.liveSessions;
    const anzahl = ls ? (Array.isArray(ls) ? ls.length : Object.keys(ls).length) : 0;
    console.log(`  LIVE ${w.eventWindowId} canLiveSpectate=${w.canLiveSpectate} HTTP ${lr.status} eintraege=${lj?.entries?.length ?? '-'} liveSessions=${anzahl}`);
    if (anzahl) console.log('    Beispiel:', kurz(ls, 1500));
    // Rohschluessel der Antwort, falls Epic das Feld anders nennt
    if (lj) console.log('    Felder:', Object.keys(lj).join(','));
  }
}
