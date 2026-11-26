import { useCallback, useEffect, useRef, useState } from 'react';
import T from '../port/app/components/T';
import StreamerClips from './StreamerClips';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { useT } from '../port/app/components/SprachProvider';

/*
 * TikTok (Betreiber, 20.10.2026): das tägliche Video mit den fünf Ersten des letzten Cups - fertig zum Herunterladen, dazu der Text zum Kopieren. Hochgeladen wird von Hand
 * (TikTok erlaubt Programmen das Hochladen nicht ohne eigene Freigabe). Gebaut wird jeden Morgen um 7:45 UTC von selbst (.github/workflows/tiktok-tag.yml); mit dem Knopf
 * "Jetzt ein neues bauen" startest du den Ablauf sofort. Gebaut wird auf GitHub, nicht hier: die Seite fragt nur den Stand ab und zeigt ihn - schließen, neu laden oder
 * wechseln bricht nichts ab, und beim Zurückkommen steht das Video da (oder der laufende Stand).
 */

interface Video { datum: string; titel: string; region: string; dauer: number; mb: number; text: string; seite: string | null; marken?: string[]; video: string; datei: string }
interface Lauf { status: string; ergebnis: string | null; seit: string; adresse: string }

const MERKER = 'comphub-tiktok-gestartet';

/** Wann der Knopf zuletzt gedrückt wurde - überbrückt die paar Sekunden, bis GitHub den neuen Lauf auflistet (nur eine Bequemlichkeit pro Browser). */
function gemerkt(): number {
  try { return Number(localStorage.getItem(MERKER)) || 0; } catch { return 0; }
}
function merke(ms: number) {
  try { if (ms) localStorage.setItem(MERKER, String(ms)); else localStorage.removeItem(MERKER); } catch { /* ohne Speicher geht es auch */ }
}

async function antwort(r: Response): Promise<{ ok?: boolean; fehler?: string; error?: string; videos?: Video[]; lauf?: Lauf | null; schon?: boolean; grenze?: boolean; frei?: number }> {
  try { return await r.json(); } catch { return { fehler: `HTTP ${r.status}` }; }
}

export default function TiktokSeite() {
  const t = useT();
  /** Der Fehlertext aus der Antwort - beim GitHub-Limit mit der Uhrzeit, ab der es wieder geht. */
  const meldung = useCallback((j: { fehler?: string; error?: string; grenze?: boolean; frei?: number }, status: number, sonst: string) => {
    const text = t(j.fehler ?? j.error ?? '') || `${sonst} (${status})`;
    if (j.grenze && j.frei) return `${text} ${t('Available again from')} ${new Date(j.frei).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
    return text;
  }, [t]);
  const [liste, setListe] = useState<Video[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [stand, setStand] = useState('');
  const [kopiert, setKopiert] = useState('');
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [wartet, setWartet] = useState(0); // Zeitpunkt des Knopfdrucks, solange der neue Lauf noch nicht aufgelistet ist
  const [jetzt, setJetzt] = useState(() => Date.now());
  const vorher = useRef<string>('');

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/tiktok', { cache: 'no-store' });
      const j = await antwort(r);
      if (!r.ok || !j.ok) { setFehler(meldung(j, r.status, t('The list could not be loaded.'))); return; }
      setFehler(''); setListe(j.videos ?? []); setLauf(j.lauf ?? null);
      const gestartet = gemerkt();
      // Der neue Lauf ist aufgelistet (oder der Knopfdruck liegt zu lange zurück): das Warten ist vorbei.
      if (gestartet && (j.lauf && Date.parse(j.lauf.seit) >= gestartet - 60_000 || Date.now() - gestartet > 120_000)) { merke(0); setWartet(0); }
      else setWartet(gestartet);
    } catch { setFehler(t('The list could not be loaded.')); }
  }, [t, meldung]);
  useEffect(() => { void Promise.resolve().then(holen); }, [holen]);

  const baut = (lauf && lauf.status !== 'completed') || wartet > 0;

  // Solange gebaut wird: alle 15 Sekunden den Stand holen (in den ersten Sekunden nach dem Knopf alle 4), dazu die Uhr für "seit n Minuten".
  useEffect(() => {
    if (!baut) return;
    const takt = setInterval(() => setJetzt(Date.now()), 1000);
    const abfrage = setInterval(() => void holen(), wartet ? 4000 : 15000);
    return () => { clearInterval(takt); clearInterval(abfrage); };
  }, [baut, wartet, holen]);

  // Wechselt ein Lauf von "läuft" auf "fertig", steht das Ergebnis oben (die Liste ist mit der Abfrage schon neu).
  useEffect(() => {
    const k = lauf ? `${lauf.seit}|${lauf.status}` : '';
    if (vorher.current.endsWith('|in_progress') && lauf?.status === 'completed' && vorher.current.startsWith(lauf.seit)) {
      setStand(lauf.ergebnis === 'success' ? t('The new video is ready.') : t('The run failed - the log shows why.'));
    }
    vorher.current = k;
  }, [lauf, t]);

  /*
   * Ein eigenes Video bestellen (Betreiber, 20.10.2026): statt des letzten Cups die besten fuenf Spieler einer Region mit Kurzbeschreibung oder der Rueckblick auf einen Spieler.
   * Alles, was hier steht, kommt genau so ins Video - die Zahlen sind dieselben wie in den Statistiken.
   */
  const [art, setArt] = useState<'letzter' | 'top5' | 'spieler' | 'prognose'>('letzter');
  const [region, setRegion] = useState('EU');
  const [zahlen, setZahlen] = useState('verdienst');
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [spieler, setSpieler] = useState('');

  const neu = async () => {
    if (art === 'spieler' && spieler.trim().length < 2) { setStand(t('Please enter a player name.')); return; }
    setStand(t('starting …'));
    try {
      const anfrage = art === 'top5' ? { vorlage: 'top5', region, liste: zahlen, jahr } : art === 'spieler' ? { vorlage: 'spieler', name: spieler.trim(), jahr } : art === 'prognose' ? { vorlage: 'prognose', region: region || 'EU' } : undefined;
      const r = await fetch('/api/admin/tiktok', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'neu', ...(anfrage ? { anfrage } : {}) }) });
      const j = await antwort(r);
      if (!r.ok || !j.ok) { setStand(meldung(j, r.status, t('That did not work.'))); return; }
      setStand(j.schon ? t('A build is already running - you see its status here.') : t('Started - the video is here in about ten minutes. You can close the page.'));
      const jetztMs = Date.now();
      if (!j.schon) { merke(jetztMs); setWartet(jetztMs); }
      void holen();
    } catch { setStand(`${t('That did not work.')} (${t('no connection')})`); }
  };

  const kopieren = async (v: Video) => {
    try { await navigator.clipboard.writeText(v.text); setKopiert(v.datei); setTimeout(() => setKopiert(''), 2000); } catch { /* ohne Zwischenablage bleibt der Text zum Markieren */ }
  };

  const seit = lauf ? Math.max(0, Math.round((jetzt - Date.parse(lauf.seit)) / 60000)) : 0;
  const fehlgeschlagen = !baut && lauf?.status === 'completed' && lauf.ergebnis && lauf.ergebnis !== 'success';

  return (
    <main className="text-white">
      <div className="">
        <SeitenKopf className="mb-6" marke={<T>Promotion</T>} titel={<T>TikTok-Videos</T>}
          text={<T>Every morning a short portrait video with the top five of the last cup is made by itself - English voice, music, subtitles. Download it here and copy the text; uploading is done by hand.</T>} />
        <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-5">
          <h2 className="text-sm font-bold text-white"><T>What should the video show?</T></h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {([['letzter', 'The last cup'], ['top5', 'Top 5 players'], ['spieler', 'A player in review'], ['prognose', 'Prediction for the next day']] as const).map(([k, n]) => (
              <button key={k} type="button" onClick={() => setArt(k)} aria-pressed={art === k}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${art === k ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-white/15 text-white/70 hover:border-white/30'}`}>
                {t(n)}
              </button>
            ))}
          </div>
          {art === 'letzter' && <p className="mt-3 text-xs text-white/55"><T>The top five of the cup that ended last - like every morning by itself.</T></p>}
          {art !== 'letzter' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {art === 'prognose' && (
                <label className="grid gap-1 text-xs text-white/55"><T>Region</T>
                  <select value={region || 'EU'} onChange={(e) => setRegion(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white">
                    {[['EU', 'Europe (EU)'], ['NAC', 'NA Central'], ['NAW', 'NA West'], ['BR', 'Brazil'], ['ASIA', 'Asia'], ['ME', 'Middle East'], ['OCE', 'Oceania']].map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}
                  </select>
                </label>
              )}
              {art === 'top5' && (
                <>
                  <label className="grid gap-1 text-xs text-white/55"><T>Region</T>
                    <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white">
                      {[['', 'All regions'], ['EU', 'Europe (EU)'], ['NAC', 'NA Central'], ['NAW', 'NA West'], ['BR', 'Brazil'], ['ASIA', 'Asia'], ['ME', 'Middle East'], ['OCE', 'Oceania']].map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-white/55"><T>By what?</T>
                    <select value={zahlen} onChange={(e) => setZahlen(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white">
                      {[['verdienst', 'Prize Pool'], ['elims', 'Eliminations'], ['teamElims', 'Team eliminations'], ['damage', 'Damage'], ['hits', 'Hits'], ['headshots', 'Headshots'], ['builds', 'Builds placed'], ['quote', 'Damage ratio']].map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}
                    </select>
                  </label>
                </>
              )}
              {art === 'spieler' && (
                <label className="grid gap-1 text-xs text-white/55 sm:col-span-2"><T>Spieler</T>
                  <input value={spieler} onChange={(e) => setSpieler(e.target.value)} placeholder="Shxrk" spellCheck={false}
                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
                </label>
              )}
              {art !== 'prognose' && <label className="grid gap-1 text-xs text-white/55"><T>Jahr</T>
                <select value={jahr} onChange={(e) => setJahr(Number(e.target.value))} className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white">
                  {Array.from({ length: new Date().getFullYear() - 2022 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>}
            </div>
          )}
          {art === 'top5' && <p className="mt-3 text-xs text-white/55"><T>The best five of the stats page for this selection - each with a line on why they are there (numbers and where else they rank high).</T></p>}
          {art === 'spieler' && <p className="mt-3 text-xs text-white/55"><T>The player's five best placements this year, with cup and date, plus their record and latest result.</T></p>}
          {art === 'prognose' && <p className="mt-3 text-xs text-white/55"><T>After day 1 of a multi-day final: who wins the tournament, projected from the real numbers of the day (points per game without the best game, wins, top-10 placements), with a reason per player. For Europe it is made by itself after the day 1 video.</T></p>}
          <div className="mt-4">
            <button type="button" disabled={baut} onClick={() => void neu()}
              className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50">
              <T>Build video</T>
            </button>
          </div>
        </section>
        <StreamerClips />
        {baut && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-sky-400" aria-hidden />
            <div className="text-sm text-sky-100">
              <p className="font-semibold">
                {lauf && lauf.status === 'in_progress' && !wartet ? t('The video is being built') : t('The video is queued')}
                {lauf && Date.parse(lauf.seit) <= jetzt && <span className="font-normal text-sky-300"> · {t('seit')} {seit} {t('min')}</span>}
              </p>
              <p className="mt-0.5 text-xs text-sky-300/80"><T>It is built on the server - you can close, reload or leave the page. The video shows here once it is done.</T></p>
              {lauf && <a href={lauf.adresse} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-300 underline underline-offset-2 hover:text-sky-100"><T>View log</T></a>}
            </div>
          </div>
        )}
        {fehlgeschlagen && lauf && (
          <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            <T>The last run failed.</T>{' '}
            <a href={lauf.adresse} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-rose-100"><T>View log</T></a>
          </p>
        )}
        {stand && <p className="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-300">{stand}</p>}
        {fehler && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{fehler}</p>}
        {liste === null && !fehler && <p className="py-10 text-center text-xs text-white/30"><T>Wird geladen …</T></p>}
        {liste && !liste.length && !fehler && !baut && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl px-5 py-8 text-center text-sm text-white/55"><T>No video yet. The first run is tomorrow morning - or start it above.</T></p>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {(liste ?? []).map((v) => (
            <article key={v.datei} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
              <video src={v.video} controls preload="metadata" playsInline className="mx-auto block aspect-[9/16] max-h-[540px] w-full bg-black object-contain" />
              <div className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-400">{v.datum} · {v.region} · {Math.round(v.dauer)} s · {v.mb} MB</p>
                <h2 className="mt-1 text-lg font-extrabold leading-tight text-white">{v.titel}</h2>
                {!!v.marken?.length && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {v.marken.map((m) => <span key={m} className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-300">{m}</span>)}
                  </div>
                )}
                <textarea readOnly value={v.text} rows={8} className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs leading-relaxed text-white/70 outline-none" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={v.video} download={v.datei} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Download video</T></a>
                  <button type="button" onClick={() => void kopieren(v)} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/85 transition hover:border-sky-500 hover:text-sky-400">
                    {kopiert === v.datei ? <T>Kopiert</T> : <T>Text kopieren</T>}
                  </button>
                  {v.seite && <a href={v.seite} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/55 transition hover:text-white/85"><T>Cup-Seite</T></a>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
