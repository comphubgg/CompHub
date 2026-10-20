'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import T from '@/app/components/T';
import SeitenKopf from '@/app/components/SeitenKopf';
import { useT } from '@/app/components/SprachProvider';

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
    if (j.grenze && j.frei) return `${text} ${t('Wieder frei ab')} ${new Date(j.frei).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
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
      if (!r.ok || !j.ok) { setFehler(meldung(j, r.status, t('Die Liste ließ sich nicht laden.'))); return; }
      setFehler(''); setListe(j.videos ?? []); setLauf(j.lauf ?? null);
      const gestartet = gemerkt();
      // Der neue Lauf ist aufgelistet (oder der Knopfdruck liegt zu lange zurück): das Warten ist vorbei.
      if (gestartet && (j.lauf && Date.parse(j.lauf.seit) >= gestartet - 60_000 || Date.now() - gestartet > 120_000)) { merke(0); setWartet(0); }
      else setWartet(gestartet);
    } catch { setFehler(t('Die Liste ließ sich nicht laden.')); }
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
      setStand(lauf.ergebnis === 'success' ? t('Das neue Video ist fertig.') : t('Der Lauf ist fehlgeschlagen - das Protokoll zeigt, woran es lag.'));
    }
    vorher.current = k;
  }, [lauf, t]);

  /*
   * Ein eigenes Video bestellen (Betreiber, 20.10.2026): statt des letzten Cups die besten fuenf Spieler einer Region mit Kurzbeschreibung oder der Rueckblick auf einen Spieler.
   * Alles, was hier steht, kommt genau so ins Video - die Zahlen sind dieselben wie in den Statistiken.
   */
  const [art, setArt] = useState<'letzter' | 'top5' | 'spieler'>('letzter');
  const [region, setRegion] = useState('EU');
  const [zahlen, setZahlen] = useState('verdienst');
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [spieler, setSpieler] = useState('');

  const neu = async () => {
    if (art === 'spieler' && spieler.trim().length < 2) { setStand(t('Bitte einen Spielernamen eintragen.')); return; }
    setStand(t('startet …'));
    try {
      const anfrage = art === 'top5' ? { vorlage: 'top5', region, liste: zahlen, jahr } : art === 'spieler' ? { vorlage: 'spieler', name: spieler.trim(), jahr } : undefined;
      const r = await fetch('/api/admin/tiktok', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'neu', ...(anfrage ? { anfrage } : {}) }) });
      const j = await antwort(r);
      if (!r.ok || !j.ok) { setStand(meldung(j, r.status, t('Das hat nicht geklappt.'))); return; }
      setStand(j.schon ? t('Es läuft schon eine Erstellung - hier siehst du ihren Stand.') : t('Gestartet - in etwa zehn Minuten ist das Video hier. Du kannst die Seite schließen.'));
      const jetztMs = Date.now();
      if (!j.schon) { merke(jetztMs); setWartet(jetztMs); }
      void holen();
    } catch { setStand(`${t('Das hat nicht geklappt.')} (${t('keine Verbindung')})`); }
  };

  const kopieren = async (v: Video) => {
    try { await navigator.clipboard.writeText(v.text); setKopiert(v.datei); setTimeout(() => setKopiert(''), 2000); } catch { /* ohne Zwischenablage bleibt der Text zum Markieren */ }
  };

  const seit = lauf ? Math.max(0, Math.round((jetzt - Date.parse(lauf.seit)) / 60000)) : 0;
  const fehlgeschlagen = !baut && lauf?.status === 'completed' && lauf.ergebnis && lauf.ergebnis !== 'success';

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <SeitenKopf className="mb-6" marke={<T>Promotion</T>} titel={<T>TikTok-Videos</T>}
          text={<T>Jeden Morgen entsteht von selbst ein kurzes Hochformat-Video mit den fünf Ersten des letzten Cups - englische Stimme, Musik, Untertitel. Hier lädst du es herunter und kopierst den Text; hochgeladen wird von Hand.</T>} />
        <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-bold text-white"><T>Was soll das Video zeigen?</T></h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {([['letzter', 'Der letzte Cup'], ['top5', 'Top 5 Spieler'], ['spieler', 'Ein Spieler im Rückblick']] as const).map(([k, n]) => (
              <button key={k} type="button" onClick={() => setArt(k)} aria-pressed={art === k}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${art === k ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-700 text-slate-300 hover:border-zinc-500'}`}>
                {t(n)}
              </button>
            ))}
          </div>
          {art === 'letzter' && <p className="mt-3 text-xs text-slate-400"><T>Die fünf Ersten des Cups, der zuletzt zu Ende ging - wie jeden Morgen von selbst.</T></p>}
          {art !== 'letzter' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {art === 'top5' && (
                <>
                  <label className="grid gap-1 text-xs text-slate-400"><T>Region</T>
                    <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100">
                      {[['', 'Alle Regionen'], ['EU', 'Europa (EU)'], ['NAC', 'NA Central'], ['NAW', 'NA West'], ['BR', 'Brasilien'], ['ASIA', 'Asien'], ['ME', 'Mittlerer Osten'], ['OCE', 'Ozeanien']].map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400"><T>Wonach?</T>
                    <select value={zahlen} onChange={(e) => setZahlen(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100">
                      {[['verdienst', 'Preisgeld'], ['elims', 'Eliminierungen'], ['teamElims', 'Team-Eliminierungen'], ['damage', 'Schaden'], ['hits', 'Treffer'], ['headshots', 'Kopftreffer'], ['builds', 'Bauteile'], ['quote', 'Schadensquote']].map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}
                    </select>
                  </label>
                </>
              )}
              {art === 'spieler' && (
                <label className="grid gap-1 text-xs text-slate-400 sm:col-span-2"><T>Spieler</T>
                  <input value={spieler} onChange={(e) => setSpieler(e.target.value)} placeholder="Shxrk" spellCheck={false}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                </label>
              )}
              <label className="grid gap-1 text-xs text-slate-400"><T>Jahr</T>
                <select value={jahr} onChange={(e) => setJahr(Number(e.target.value))} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100">
                  {Array.from({ length: new Date().getFullYear() - 2022 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            </div>
          )}
          {art === 'top5' && <p className="mt-3 text-xs text-slate-400"><T>Die besten fünf der Statistik-Seite für diese Auswahl - jeder mit einer Zeile, wieso er dort steht (Zahlen und wo er sonst weit oben liegt).</T></p>}
          {art === 'spieler' && <p className="mt-3 text-xs text-slate-400"><T>Die fünf besten Platzierungen des Spielers in diesem Jahr, mit Cup und Datum, dazu seine Bilanz und das neueste Ergebnis.</T></p>}
          <div className="mt-4">
            <button type="button" disabled={baut} onClick={() => void neu()}
              className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50">
              <T>Video bauen</T>
            </button>
          </div>
        </section>
        {baut && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-sky-400" aria-hidden />
            <div className="text-sm text-sky-100">
              <p className="font-semibold">
                {lauf && lauf.status === 'in_progress' && !wartet ? t('Das Video wird gerade gebaut') : t('Das Video steht in der Warteschlange')}
                {lauf && Date.parse(lauf.seit) <= jetzt && <span className="font-normal text-sky-300"> · {t('seit')} {seit} {t('min')}</span>}
              </p>
              <p className="mt-0.5 text-xs text-sky-300/80"><T>Gebaut wird auf dem Server - du kannst die Seite schließen, neu laden oder wechseln. Das Video steht hier, sobald es fertig ist.</T></p>
              {lauf && <a href={lauf.adresse} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-300 underline underline-offset-2 hover:text-sky-100"><T>Protokoll ansehen</T></a>}
            </div>
          </div>
        )}
        {fehlgeschlagen && lauf && (
          <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            <T>Der letzte Lauf ist fehlgeschlagen.</T>{' '}
            <a href={lauf.adresse} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-rose-100"><T>Protokoll ansehen</T></a>
          </p>
        )}
        {stand && <p className="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-300">{stand}</p>}
        {fehler && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{fehler}</p>}
        {liste === null && !fehler && <p className="py-10 text-center text-xs text-slate-600"><T>Wird geladen …</T></p>}
        {liste && !liste.length && !fehler && !baut && (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center text-sm text-slate-400"><T>Noch kein Video da. Der erste Lauf kommt morgen früh - oder du startest ihn oben.</T></p>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {(liste ?? []).map((v) => (
            <article key={v.datei} className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-[0_10px_30px_rgba(15,23,42,.18)]">
              <video src={v.video} controls preload="metadata" playsInline className="mx-auto block aspect-[9/16] max-h-[540px] w-full bg-black object-contain" />
              <div className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-400">{v.datum} · {v.region} · {Math.round(v.dauer)} s · {v.mb} MB</p>
                <h2 className="mt-1 text-lg font-extrabold leading-tight text-white">{v.titel}</h2>
                {!!v.marken?.length && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {v.marken.map((m) => <span key={m} className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-300">{m}</span>)}
                  </div>
                )}
                <textarea readOnly value={v.text} rows={8} className="mt-3 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-slate-300 outline-none" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={v.video} download={v.datei} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Video herunterladen</T></a>
                  <button type="button" onClick={() => void kopieren(v)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-500 hover:text-sky-400">
                    {kopiert === v.datei ? <T>Kopiert</T> : <T>Text kopieren</T>}
                  </button>
                  {v.seite && <a href={v.seite} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"><T>Cup-Seite</T></a>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
