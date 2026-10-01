import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { offen as offeneMeldungen } from '@/lib/kontakt';

/*
 * Die Admin-Zentrale: was laeuft, was ist offen - auf einen Blick.
 *
 * Der Betreiber (1.10.2026): "alles optimieren fuer den Admin: simpler,
 * optisch besser sichtbar". Bisher musste er in Discord oder auf GitHub
 * nachsehen, ob der Datenlauf noch laeuft, ob ein Ablauf gescheitert ist und
 * ob im Posteingang etwas wartet. Diese Antwort sammelt das an einer Stelle.
 *
 *   GET -> { jobs: [...], kontaktOffen: n, auftraege: [...] | null, stand }
 *
 * Die Laeufe stehen bei GitHub Actions. Die Auskunft dort ist oeffentlich
 * (das Projekt ist es), braucht also keinen Schluessel; ist GITHUB_TOKEN
 * gesetzt, wird er benutzt - das hebt die Grenze von 60 auf 5000 Abfragen je
 * Stunde. Ohne Schluessel gilt die Grenze je Adresse, und auf einem geteilten
 * Server kann sie von anderen aufgebraucht sein: dann steht bei den Laeufen
 * "nicht abrufbar", nie ein erfundener Zustand.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REPO = 'comphubgg/CompHub';

/** Die Ablaeufe, die der Betreiber im Blick haben will. */
const ABLAEUFE: Array<{ schluessel: string; datei: string; name: string; was: string; ruhigBisMin: number }> = [
  { schluessel: 'daten', datei: 'daten-erneuern.yml', name: 'Datenlauf', was: 'Statistiken, Profile, Startseite', ruhigBisMin: 240 },
  { schluessel: 'replays', datei: 'replays-nacharbeiten.yml', name: 'Replays', was: 'Rückstand abarbeiten', ruhigBisMin: 300 },
  { schluessel: 'clutch', datei: 'clutch-rechnen.yml', name: 'Solo Clutch', was: 'Punkte je Spieltag', ruhigBisMin: 24 * 60 },
  { schluessel: 'kader', datei: 'org-kader.yml', name: 'Org-Kader', was: 'Abgleich mit Liquipedia', ruhigBisMin: 36 * 60 },
  { schluessel: 'verlauf', datei: 'team-verlauf.yml', name: 'Team-Verlauf', was: 'Spielerhistorie', ruhigBisMin: 36 * 60 },
  { schluessel: 'pruefung', datei: 'seitenpruefung.yml', name: 'Seitenprüfung', was: 'Antworten alle Seiten?', ruhigBisMin: 120 },
  { schluessel: 'sicherung', datei: 'sicherung.yml', name: 'Sicherung', was: 'Tägliche Kopie der gepflegten Dateien', ruhigBisMin: 36 * 60 },
  { schluessel: 'live', datei: 'replays-live.yml', name: 'Live-Replays', was: 'Laufende Cups einsammeln', ruhigBisMin: 240 },
];

interface Lauf {
  status: string; conclusion: string | null; zeit: string; url: string;
}
interface JobAntwort {
  schluessel: string; name: string; was: string;
  /** Laeuft gerade, oder wartet. */
  aktiv: Lauf | null;
  /** Der letzte abgeschlossene Lauf. */
  letzter: Lauf | null;
  /** ok | warnung | fehler | unbekannt */
  ampel: 'ok' | 'warnung' | 'fehler' | 'unbekannt';
  hinweis: string;
}

const merker = new Map<string, { bis: number; wert: JobAntwort }>();
const MERK_MS = 15 * 60_000;

async function holeLauf(a: typeof ABLAEUFE[number]): Promise<JobAntwort> {
  const m = merker.get(a.schluessel);
  if (m && Date.now() < m.bis) return m.wert;

  const kopf: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'comphub-zentrale' };
  if (process.env.GITHUB_TOKEN) kopf.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const basis: Omit<JobAntwort, 'ampel' | 'hinweis' | 'aktiv' | 'letzter'> = { schluessel: a.schluessel, name: a.name, was: a.was };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${a.datei}/runs?per_page=8`,
      { headers: kopf, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json() as { workflow_runs?: Array<{ status: string; conclusion: string | null; created_at: string; updated_at: string; html_url: string }> };
    const laeufe = (j.workflow_runs ?? []).map((x) => ({
      status: x.status, conclusion: x.conclusion, zeit: x.status === 'completed' ? x.updated_at : x.created_at, url: x.html_url,
    }));
    const aktiv = laeufe.find((l) => l.status !== 'completed') ?? null;
    // Abgebrochene Laeufe zaehlen nicht: sie wurden von einem neueren abgeloest, nicht von einem Fehler.
    const letzter = laeufe.find((l) => l.status === 'completed' && l.conclusion !== 'cancelled') ?? null;
    const alterMin = letzter ? (Date.now() - Date.parse(letzter.zeit)) / 60_000 : Infinity;
    let ampel: JobAntwort['ampel'] = 'ok';
    let hinweis = '';
    if (!letzter) { ampel = 'unbekannt'; hinweis = 'noch kein Lauf'; }
    else if (letzter.conclusion !== 'success') { ampel = 'fehler'; hinweis = 'der letzte Lauf ist gescheitert'; }
    else if (alterMin > a.ruhigBisMin && !aktiv) { ampel = 'warnung'; hinweis = 'länger nichts gelaufen als üblich'; }
    const wert: JobAntwort = { ...basis, aktiv, letzter, ampel, hinweis };
    merker.set(a.schluessel, { bis: Date.now() + MERK_MS, wert });
    return wert;
  } catch (e) {
    return { ...basis, aktiv: null, letzter: null, ampel: 'unbekannt', hinweis: `nicht abrufbar (${(e as Error).message})` };
  }
}

/*
 * Die offenen Auftraege - gelesen aus #admin-aufgaben.
 *
 * Dort steht die Liste als angepinnte Nachricht (scripts/discord-aufgaben.mjs),
 * je Auftrag eine Zeile "**12** · Titel · _Hinweis_ · seit 2026-09-28". Hier
 * wird sie nur gelesen, nie geschrieben. Ohne Bot-Token oder bei einem
 * Fehler bleibt die Liste leer und die Zentrale sagt es.
 */
interface Auftrag { id: number; titel: string; hinweis: string; seit: string }
let aufgabenMerker: { bis: number; liste: Auftrag[] } | null = null;

async function holeAuftraege(): Promise<Auftrag[] | null> {
  if (aufgabenMerker && Date.now() < aufgabenMerker.bis) return aufgabenMerker.liste;
  const token = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
  if (!token) return null;
  const server = process.env.DISCORD_SERVER_ID || '1529205620287344783';
  const kopf = { Authorization: `Bot ${token}` };
  try {
    const kanaele = await (await fetch(`https://discord.com/api/v10/guilds/${server}/channels`, { headers: kopf, signal: AbortSignal.timeout(8000) })).json() as Array<{ id: string; name: string; type: number }>;
    const kanal = Array.isArray(kanaele) ? kanaele.find((k) => k.type === 0 && k.name.toLowerCase() === 'admin-aufgaben') : null;
    if (!kanal) return null;
    const pins = await (await fetch(`https://discord.com/api/v10/channels/${kanal.id}/pins`, { headers: kopf, signal: AbortSignal.timeout(8000) })).json() as Array<{
      id?: string; timestamp: string; edited_timestamp?: string | null; embeds?: Array<{ title?: string; description?: string; footer?: { text?: string } }>;
    }>;
    if (!Array.isArray(pins)) return null;
    /*
     * Nur die aktuelle Liste, nicht die alten Staende.
     *
     * Im Kanal liegen auch aeltere angepinnte Fassungen der Liste (auch die
     * englische von vor dem 30.9.). Die aktuelle erkennt man daran, dass das
     * Skript alle ihre Teile in einem Zug neu schreibt: ihre letzte Aenderung
     * liegt innerhalb weniger Minuten beieinander. Genommen werden alle
     * Listen-Nachrichten, deren Stand hoechstens fuenfzehn Minuten hinter der
     * juengsten liegt.
     */
    const stand = (m: typeof pins[number]) => Date.parse(m.edited_timestamp ?? m.timestamp);
    const listen = pins.filter((m) => /^Offene Aufträge \(/.test(m.embeds?.[0]?.title ?? ''));
    // Das Skript schreibt die Kennungen der aktuellen Nachrichten in den Fuss der letzten ("msgs: a,b,c").
    const mitKennung = listen
      .map((m) => ({ m, ids: /msgs: ([0-9,]+)/.exec(m.embeds?.[0]?.footer?.text ?? '')?.[1]?.split(',') ?? [] }))
      .filter((x) => x.ids.length > 0)
      .sort((x, y) => stand(y.m) - stand(x.m))[0];
    const juengste = Math.max(0, ...listen.map(stand));
    const aktuell = mitKennung
      ? mitKennung.ids.map((id) => pins.find((m) => (m as { id?: string }).id === id)).filter((m): m is typeof pins[number] => !!m)
      : listen.filter((m) => juengste - stand(m) <= 15 * 60_000);
    const liste: Auftrag[] = [];
    // Erst Teil 1, dann 2/3, 3/3 - die Reihenfolge der Auftraege bleibt wie im Kanal.
    const teil = (m: typeof pins[number]) => Number(/\((\d+)\/\d+\)/.exec(m.embeds?.[0]?.title ?? '')?.[1] ?? 1);
    for (const m of [...aktuell].sort((x, y) => teil(x) - teil(y))) {
      for (const z of (m.embeds?.[0]?.description ?? '').split(String.fromCharCode(10))) {
        if (/^\*\*Zuletzt erledigt\*\*/.test(z)) break;
        const t = /^\*\*(\d+)\*\* · (.+?)(?: · _(.+)_)? · seit (\d{4}-\d{2}-\d{2})$/.exec(z.trim());
        if (t) liste.push({ id: Number(t[1]), titel: t[2], hinweis: t[3] ?? '', seit: t[4] });
      }
    }
    aufgabenMerker = { bis: Date.now() + 5 * 60_000, liste };
    return liste;
  } catch { return null; }
}

export async function GET(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ fehler: 'Nicht erlaubt.' }, { status: 403 });
  }
  const [jobs, kontaktOffen, auftraege] = await Promise.all([
    Promise.all(ABLAEUFE.map(holeLauf)),
    offeneMeldungen().catch(() => null),
    holeAuftraege(),
  ]);
  return NextResponse.json({ jobs, kontaktOffen, auftraege, stand: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
